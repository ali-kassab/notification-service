import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

/** Read-only aggregates for the dashboard. Counts are per inbox entry (one per recipient). */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async forProjects(projectIds: string[]) {
    const inProjects = { projectId: { in: projectIds } };
    const [notifications, total, read, delivered, endUsers, byTypeRows, recent] = await Promise.all([
      this.prisma.notification.count({ where: inProjects }),
      this.prisma.notificationRecipient.count({ where: inProjects }),
      this.prisma.notificationRecipient.count({ where: { ...inProjects, readAt: { not: null } } }),
      this.prisma.notificationRecipient.count({
        where: { ...inProjects, deliveredAt: { not: null } },
      }),
      this.prisma.endUser.count({ where: inProjects }),
      this.prisma.notification.groupBy({
        by: ['type'],
        where: inProjects,
        _sum: { recipientCount: true },
        _count: { _all: true },
      }),
      this.prisma.notification.findMany({
        where: inProjects,
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { project: { select: { id: true, name: true, slug: true } } },
      }),
    ]);

    const byType = Object.fromEntries(
      Object.values(NotificationType).map((t) => {
        const row = byTypeRows.find((r) => r.type === t);
        return [t, { notifications: row?._count._all ?? 0, recipients: row?._sum.recipientCount ?? 0 }];
      }),
    );

    return {
      notifications, // distinct sends
      recipients: { total, read, unread: total - read, delivered },
      endUsers,
      byType,
      recent,
    };
  }
}
