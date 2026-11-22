import { useCallback, useEffect, useMemo, useState } from 'react';
import { NotificationInbox, type InboxNotification } from 'notification-service-sdk/browser';
import { NAAS_BASE_URL } from './App';

export function Inbox({ userId, onLogout }: { userId: string; onLogout: () => void }) {
  // The browser only ever holds a short-lived user token, fetched from the app's own backend.
  const inbox = useMemo(
    () =>
      new NotificationInbox({
        baseUrl: NAAS_BASE_URL,
        token: async () => {
          const res = await fetch('/api/token', { method: 'POST', headers: { 'x-demo-user': userId } });
          if (!res.ok) throw new Error('Could not get a notification token');
          return (await res.json()).token;
        },
      }),
    [userId],
  );

  const [items, setItems] = useState<InboxNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stored notifications (including those sent while offline) come from the REST API.
  const reload = useCallback(async () => {
    try {
      const page = await inbox.list({ limit: 50 });
      setItems(page.data);
      setUnread(await inbox.unreadCount());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [inbox]);

  useEffect(() => {
    void reload();
    return inbox.subscribe({
      onConnected: ({ unreadCount }) => {
        setOnline(true);
        setUnread(unreadCount);
        void reload(); // catch up on anything missed while disconnected
      },
      onDisconnected: () => setOnline(false),
      onNotification: (n) => setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev])),
      onInboxUpdated: (u) => {
        setUnread(u.unreadCount);
        if (u.action === 'read' || u.action === 'read_all' || u.action === 'deleted') void reload();
      },
      onError: (e) => setError(e.message),
    });
  }, [inbox, reload]);

  async function markRead(id: string) {
    const updated = await inbox.markAsRead(id);
    setItems((prev) => prev.map((p) => (p.id === id ? updated : p)));
  }

  async function placeOrder() {
    await fetch('/api/place-order', { method: 'POST', headers: { 'x-demo-user': userId } });
  }

  return (
    <main className="card">
      <header className="row between">
        <div>
          <h1>Acme Shop</h1>
          <span className="muted">
            Signed in as <b>{userId}</b> · <span className={online ? 'ok' : 'warn'}>{online ? 'live' : 'offline'}</span>
          </span>
        </div>
        <button className="secondary" onClick={onLogout}>
          Sign out
        </button>
      </header>

      <section className="row">
        <button onClick={placeOrder}>Place an order</button>
        <span className="muted">The demo backend sends you a notification through the SDK.</span>
      </section>

      <section>
        <div className="row between">
          <h2>
            Inbox <span className="badge">{unread} unread</span>
          </h2>
          <button className="secondary" disabled={!unread} onClick={() => inbox.markAllAsRead()}>
            Mark all as read
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {items.length === 0 && <p className="muted">No notifications yet.</p>}
        <ul className="list">
          {items.map((n) => (
            <li key={n.id} className={`item type-${n.type.toLowerCase()} ${n.read ? 'read' : ''}`}>
              <div>
                <strong>{n.title}</strong> <small className="muted">{n.type} · {n.priority}</small>
                <p>{n.message}</p>
                <small className="muted">{new Date(n.createdAt).toLocaleString()}</small>
              </div>
              {!n.read && (
                <button className="secondary" onClick={() => markRead(n.id)}>
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
