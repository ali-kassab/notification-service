import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { InboxScope } from '../common/types';
import { NotificationsGateway } from '../gateways/notifications.gateway';
import { InboxItem } from '../notifications/inbox-item';

export type InboxAction = 'created' | 'read' | 'read_all' | 'deleted';

/**
 * Real-time delivery of notifications that are ALREADY persisted in PostgreSQL.
 *
 * - Offline users: nothing is emitted; the notification stays STORED and is returned by the
 *   inbox API when the user's client reconnects/refreshes.
 * - Online users: the `notification` event is emitted with an acknowledgement callback.
 *   Only when a client acks is the inbox entry marked DELIVERED.
 */
@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly gateway: NotificationsGateway,
    private readonly prisma: PrismaService,
  ) {}

  async deliver(items: InboxItem[]): Promise<void> {
    await Promise.all(
      items.map(async (item) => {
        try {
          const acked = await this.gateway.emitWithAck(item.projectId, item.userId, 'notification', item);
          if (acked) {
            await this.prisma.notificationRecipient.updateMany({
              where: { id: item.id, status: 'STORED' },
              data: { status: 'DELIVERED', deliveredAt: new Date() },
            });
          }
          await this.syncInbox({ projectId: item.projectId, userId: item.userId }, 'created', [item.id]);
        } catch (e) {
          this.logger.warn(`Real-time delivery failed for ${item.id}: ${(e as Error).message}`);
        }
      }),
    );
  }

  /** Keeps every open tab/device of a user in sync after inbox changes (unread badge etc.). */
  async syncInbox(scope: InboxScope, action: InboxAction, ids: string[] = []): Promise<void> {
    if (!this.gateway.isOnline(scope.projectId, scope.userId)) return;
    const unreadCount = await this.prisma.notificationRecipient.count({
      where: { projectId: scope.projectId, recipientId: scope.userId, readAt: null },
    });
    this.gateway.emitToUser(scope.projectId, scope.userId, 'inbox_updated', { action, ids, unreadCount });
  }
}
