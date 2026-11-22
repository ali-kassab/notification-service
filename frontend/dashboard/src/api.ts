// Thin typed client for the dashboard (administrative) API. Uses the dashboard JWT.
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const TOKEN_KEY = 'naas-dashboard-token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: () => void = () => undefined;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    const msg = json?.message;
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : (msg ?? res.statusText));
  }
  return json as T;
}

export function qs(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && q.set(k, String(v)));
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ------------------------------------------------------------------ types

export type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH';
export type NotificationTarget = 'USER' | 'USERS' | 'BROADCAST';
export const TYPES: NotificationType[] = ['INFO', 'SUCCESS', 'WARNING', 'ERROR'];
export const PRIORITIES: NotificationPriority[] = ['LOW', 'NORMAL', 'HIGH'];
export const TARGETS: NotificationTarget[] = ['USER', 'USERS', 'BROADCAST'];

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  createdAt: string;
  _count?: { notifications: number; endUsers: number; apiKeys: number };
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  key?: string;
}

export interface NotificationRow {
  id: string;
  projectId: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  target: NotificationTarget;
  metadata: Record<string, unknown> | null;
  recipientCount: number;
  readCount: number;
  deliveredCount: number;
  createdAt: string;
  project?: { id: string; name: string; slug: string };
}

export interface Recipient {
  id: string;
  recipientId: string;
  status: 'STORED' | 'DELIVERED' | 'READ';
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface Stats {
  projectCount?: number;
  notifications: number;
  recipients: { total: number; read: number; unread: number; delivered: number };
  endUsers: number;
  byType: Record<NotificationType, { notifications: number; recipients: number }>;
  recent: NotificationRow[];
}
