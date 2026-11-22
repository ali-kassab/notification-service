import { Notification, NotificationRecipient, Prisma } from '@prisma/client';

/** Public shape of one inbox entry (a notification as seen by one recipient). */
export interface InboxItem {
  /** Inbox entry id - use this for read/delete operations. */
  id: string;
  notificationId: string;
  projectId: string;
  userId: string;
  title: string;
  message: string;
  type: Notification['type'];
  priority: Notification['priority'];
  metadata: Prisma.JsonValue | null;
  status: NotificationRecipient['status'];
  read: boolean;
  createdAt: Date;
  deliveredAt: Date | null;
  readAt: Date | null;
}

export function toInboxItem(row: NotificationRecipient & { notification: Notification }): InboxItem {
  const n = row.notification;
  return {
    id: row.id,
    notificationId: n.id,
    projectId: row.projectId,
    userId: row.recipientId,
    title: n.title,
    message: n.message,
    type: n.type,
    priority: n.priority,
    metadata: n.metadata,
    status: row.status,
    read: row.readAt !== null,
    createdAt: row.createdAt,
    deliveredAt: row.deliveredAt,
    readAt: row.readAt,
  };
}
