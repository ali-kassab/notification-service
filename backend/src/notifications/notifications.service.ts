import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationTarget, Prisma } from '@prisma/client';
import { paginate } from '../common/dto/pagination.dto';
import { PrismaService } from '../common/prisma/prisma.service';
import { InboxScope } from '../common/types';
import { NotificationDeliveryService } from '../notification-delivery/notification-delivery.service';
import {
  AdminNotificationsQueryDto,
  AdminRecipientsQueryDto,
  InboxQueryDto,
  MAX_METADATA_BYTES,
  NotificationContentDto,
  SendNotificationDto,
} from './dto/notification.dto';
import { InboxItem, toInboxItem } from './inbox-item';

export interface SendResult {
  id: string;
  status: 'CREATED';
  target: NotificationTarget;
  recipientCount: number;
  createdAt: Date;
}

/**
 * Core notification logic. Every method takes an explicit projectId (and, for inbox
 * operations, a userId) and every query filters on it - this is what guarantees that
 * one project can never read or modify another project's data.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  // ---------------------------------------------------------------- sending

  /** Sends to `userId` or `userIds` (exactly one must be given). */
  send(projectId: string, dto: SendNotificationDto): Promise<SendResult> {
    if (dto.userId && dto.userIds) {
      throw new BadRequestException('Provide either userId or userIds, not both');
    }
    if (dto.userId) return this.create(projectId, dto, [dto.userId], 'USER');
    if (dto.userIds) return this.create(projectId, dto, dto.userIds, 'USERS');
    throw new BadRequestException('userId or userIds is required');
  }

  /** Sends to every known end user of the project (see EndUser in the schema). */
  async broadcast(projectId: string, dto: NotificationContentDto): Promise<SendResult> {
    const users = await this.prisma.endUser.findMany({
      where: { projectId },
      select: { externalId: true },
    });
    return this.create(projectId, dto, users.map((u) => u.externalId), 'BROADCAST');
  }

  private async create(
    projectId: string,
    dto: NotificationContentDto,
    userIds: string[],
    target: NotificationTarget,
  ): Promise<SendResult> {
    const recipients = [...new Set(userIds)];
    if (dto.metadata && Buffer.byteLength(JSON.stringify(dto.metadata)) > MAX_METADATA_BYTES) {
      throw new BadRequestException(`metadata must be at most ${MAX_METADATA_BYTES} bytes`);
    }

    // 1) Persist first (content once + one inbox row per recipient) in a single transaction.
    const { notification, items } = await this.prisma.$transaction(async (tx) => {
      if (target !== 'BROADCAST' && recipients.length) {
        await tx.endUser.createMany({
          data: recipients.map((externalId) => ({ projectId, externalId })),
          skipDuplicates: true,
        });
      }
      const notification = await tx.notification.create({
        data: {
          projectId,
          title: dto.title,
          message: dto.message,
          type: dto.type ?? 'INFO',
          priority: dto.priority ?? 'NORMAL',
          metadata: (dto.metadata as Prisma.InputJsonObject | undefined) ?? undefined,
          target,
          recipientCount: recipients.length,
        },
      });
      const rows = await tx.notificationRecipient.createManyAndReturn({
        data: recipients.map((recipientId) => ({
          notificationId: notification.id,
          projectId,
          recipientId,
        })),
      });
      return { notification, items: rows.map((r) => toInboxItem({ ...r, notification })) };
    });

    // 2) Only then attempt real-time delivery. Not awaited: the HTTP response does not wait
    //    for clients to acknowledge, and a delivery failure never loses the stored notification.
    this.delivery.deliver(items).catch((e) => this.logger.error(e));

    return {
      id: notification.id,
      status: 'CREATED',
      target,
      recipientCount: recipients.length,
      createdAt: notification.createdAt,
    };
  }

  // ------------------------------------------------------------------ inbox

  /**
   * Lists one user's inbox, newest first. When `markDelivered` is set (the request came from
   * the recipient's own client), returned entries that were still STORED become DELIVERED.
   */
  async listInbox(scope: InboxScope, query: InboxQueryDto, markDelivered = false) {
    const where: Prisma.NotificationRecipientWhereInput = {
      projectId: scope.projectId,
      recipientId: scope.userId,
      ...(query.unread === true && { readAt: null }),
      ...(query.unread === false && { readAt: { not: null } }),
      ...(query.type && { notification: { type: query.type } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.notificationRecipient.findMany({
        where,
        include: { notification: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.notificationRecipient.count({ where }),
    ]);

    if (markDelivered) {
      const pending = rows.filter((r) => r.status === 'STORED');
      if (pending.length) {
        const deliveredAt = new Date();
        await this.prisma.notificationRecipient.updateMany({
          where: { id: { in: pending.map((r) => r.id) }, status: 'STORED' },
          data: { status: 'DELIVERED', deliveredAt },
        });
        pending.forEach((r) => Object.assign(r, { status: 'DELIVERED', deliveredAt }));
      }
    }
    return paginate(rows.map(toInboxItem), total, query.page, query.limit);
  }

  async unreadCount(scope: InboxScope): Promise<{ count: number }> {
    const count = await this.prisma.notificationRecipient.count({
      where: { projectId: scope.projectId, recipientId: scope.userId, readAt: null },
    });
    return { count };
  }

  async markRead(scope: InboxScope, id: string): Promise<InboxItem> {
    const where = { id, projectId: scope.projectId, recipientId: scope.userId };
    const { count } = await this.prisma.notificationRecipient.updateMany({
      where: { ...where, readAt: null },
      data: { readAt: new Date(), status: 'READ' },
    });
    const row = await this.prisma.notificationRecipient.findFirst({
      where,
      include: { notification: true },
    });
    if (!row) throw new NotFoundException('Notification not found');
    if (count) await this.delivery.syncInbox(scope, 'read', [id]);
    return toInboxItem(row);
  }

  async markAllRead(scope: InboxScope): Promise<{ updated: number }> {
    const { count } = await this.prisma.notificationRecipient.updateMany({
      where: { projectId: scope.projectId, recipientId: scope.userId, readAt: null },
      data: { readAt: new Date(), status: 'READ' },
    });
    if (count) await this.delivery.syncInbox(scope, 'read_all');
    return { updated: count };
  }

  async removeFromInbox(scope: InboxScope, id: string): Promise<void> {
    const { count } = await this.prisma.notificationRecipient.deleteMany({
      where: { id, projectId: scope.projectId, recipientId: scope.userId },
    });
    if (!count) throw new NotFoundException('Notification not found');
    await this.delivery.syncInbox(scope, 'deleted', [id]);
  }

  // ------------------------------------------------------------ dashboard

  /** Notification history of a project (one row per send) with read/delivery counts. */
  async listForProject(projectId: string, query: AdminNotificationsQueryDto) {
    const where: Prisma.NotificationWhereInput = {
      projectId,
      ...(query.type && { type: query.type }),
      ...(query.priority && { priority: query.priority }),
      ...(query.target && { target: query.target }),
      ...(query.recipientId && { recipients: { some: { recipientId: query.recipientId } } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    const counts = await this.recipientCounts(rows.map((r) => r.id));
    return paginate(
      rows.map((r) => ({ ...r, ...(counts.get(r.id) ?? { readCount: 0, deliveredCount: 0 }) })),
      total,
      query.page,
      query.limit,
    );
  }

  async getForProject(projectId: string, notificationId: string, query: AdminRecipientsQueryDto) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, projectId },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    const where: Prisma.NotificationRecipientWhereInput = {
      notificationId,
      projectId,
      ...(query.status && { status: query.status }),
    };
    const [recipients, total] = await Promise.all([
      this.prisma.notificationRecipient.findMany({
        where,
        orderBy: { recipientId: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: { id: true, recipientId: true, status: true, deliveredAt: true, readAt: true, createdAt: true },
      }),
      this.prisma.notificationRecipient.count({ where }),
    ]);
    const counts = (await this.recipientCounts([notificationId])).get(notificationId);
    return {
      ...notification,
      readCount: counts?.readCount ?? 0,
      deliveredCount: counts?.deliveredCount ?? 0,
      recipients: paginate(recipients, total, query.page, query.limit),
    };
  }

  async removeForProject(projectId: string, notificationId: string): Promise<void> {
    const { count } = await this.prisma.notification.deleteMany({
      where: { id: notificationId, projectId },
    });
    if (!count) throw new NotFoundException('Notification not found');
  }

  private async recipientCounts(ids: string[]) {
    const map = new Map<string, { readCount: number; deliveredCount: number }>();
    if (!ids.length) return map;
    const [read, delivered] = await Promise.all([
      this.prisma.notificationRecipient.groupBy({
        by: ['notificationId'],
        where: { notificationId: { in: ids }, readAt: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.notificationRecipient.groupBy({
        by: ['notificationId'],
        where: { notificationId: { in: ids }, deliveredAt: { not: null } },
        _count: { _all: true },
      }),
    ]);
    for (const id of ids) {
      map.set(id, {
        readCount: read.find((r) => r.notificationId === id)?._count._all ?? 0,
        deliveredCount: delivered.find((r) => r.notificationId === id)?._count._all ?? 0,
      });
    }
    return map;
  }
}
