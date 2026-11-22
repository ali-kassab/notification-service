export type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH';
export type NotificationTarget = 'USER' | 'USERS' | 'BROADCAST';
/** STORED = persisted; DELIVERED = a client of the recipient received it; READ = marked read. */
export type RecipientStatus = 'STORED' | 'DELIVERED' | 'READ';

export interface NotificationContent {
  title: string;
  message: string;
  /** Defaults to INFO. */
  type?: NotificationType;
  /** Defaults to NORMAL. */
  priority?: NotificationPriority;
  /** Any JSON object up to 8 KB, e.g. { url: '/orders/42' }. */
  metadata?: Record<string, unknown>;
  /** Optional safety check: must equal the project key of the API key. */
  projectKey?: string;
}

/** Send to a single user (`userId`) or to several users (`userIds`). */
export type SendNotificationInput = NotificationContent &
  ({ userId: string; userIds?: never } | { userIds: string[]; userId?: never });

export interface SendResult {
  id: string;
  status: 'CREATED';
  target: NotificationTarget;
  recipientCount: number;
  createdAt: string;
}

/** One notification in one user's inbox. `id` is the inbox entry id used for read/delete. */
export interface InboxNotification {
  id: string;
  notificationId: string;
  projectId: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  metadata: Record<string, unknown> | null;
  status: RecipientStatus;
  read: boolean;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
}

export interface ListQuery {
  page?: number;
  /** 1-100, default 20. */
  limit?: number;
  /** true = unread only, false = read only, omitted = full history. */
  unread?: boolean;
  type?: NotificationType;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface UserToken {
  token: string;
  userId: string;
  expiresAt: string;
}

export interface InboxUpdate {
  action: 'created' | 'read' | 'read_all' | 'deleted';
  ids: string[];
  unreadCount: number;
}
