// End-to-end SDK test against a RUNNING notification service.
//   1. Start the backend (cd backend && npm run build && npm start)
//   2. NAAS_BASE_URL=http://localhost:3000 npm run test:integration
// It provisions its own dashboard account, project and API key through the REST API.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { NotificationClient, NotificationInbox, NotificationServiceError } from '../dist/index.js';

const baseUrl = process.env.NAAS_BASE_URL ?? 'http://localhost:3000';
const json = (method, path, body, token) =>
  fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  }).then(async (r) => {
    if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${await r.text()}`);
    return r.json();
  });

const waitFor = async (fn, ms = 5000) => {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
};

let server; // NotificationClient (trusted backend)
let apiKey;
let revokeKey;
const cleanups = [];

before(async () => {
  const stamp = Date.now();
  const { accessToken } = await json('POST', '/auth/register', {
    email: `sdk-${stamp}@example.com`,
    name: 'SDK test',
    password: 'password123',
  });
  const project = await json('POST', '/projects', { name: `SDK ${stamp}` }, accessToken);
  const key = await json('POST', `/projects/${project.id}/api-keys`, { name: 'sdk' }, accessToken);
  apiKey = key.key;
  revokeKey = () => json('DELETE', `/projects/${project.id}/api-keys/${key.id}`, undefined, accessToken);
  server = new NotificationClient({ apiKey, baseUrl });
});

after(() => cleanups.forEach((fn) => fn()));

test('server client sends, lists, counts, marks read and deletes', async () => {
  const sent = await server.send({ userId: 'sdk-user', title: 'Payment Successful', message: 'Done', type: 'SUCCESS' });
  assert.equal(sent.status, 'CREATED');
  const multi = await server.send({ userIds: ['sdk-user', 'sdk-user-2'], title: 'Team update', message: 'Hi' });
  assert.equal(multi.recipientCount, 2);

  const list = await server.listNotifications('sdk-user');
  assert.equal(list.meta.total, 2);
  assert.equal(await server.getUnreadCount('sdk-user'), 2);

  const read = await server.markAsRead('sdk-user', list.data[0].id);
  assert.equal(read.read, true);
  assert.equal(await server.getUnreadCount('sdk-user'), 1);
  assert.deepEqual(await server.markAllAsRead('sdk-user'), { updated: 1 });

  await server.deleteNotification('sdk-user', list.data[1].id);
  assert.equal((await server.listNotifications('sdk-user')).meta.total, 1);

  const bc = await server.broadcast({ title: 'Broadcast', message: 'All users' });
  assert.equal(bc.target, 'BROADCAST');
  assert.equal(bc.recipientCount, 2);
});

test('browser inbox receives real-time notifications and keeps stored ones after reconnect', async () => {
  const userId = 'sdk-live-user';
  const inbox = new NotificationInbox({
    baseUrl,
    token: async () => (await server.createUserToken(userId)).token,
  });

  // Offline: stored, then visible on first load.
  await server.send({ userId, title: 'While offline', message: 'stored' });
  const initial = await inbox.list();
  assert.equal(initial.data[0].title, 'While offline');
  assert.equal(initial.data[0].status, 'DELIVERED');

  const received = [];
  const updates = [];
  let connected;
  const unsubscribe = inbox.subscribe({
    onConnected: (info) => (connected = info),
    onNotification: (n) => received.push(n),
    onInboxUpdated: (u) => updates.push(u),
  });
  cleanups.push(unsubscribe);
  await waitFor(() => connected);
  assert.equal(connected.unreadCount, 1);

  await server.send({ userId, title: 'Live!', message: 'real-time', priority: 'HIGH' });
  const live = await waitFor(() => received.find((n) => n.title === 'Live!'));
  assert.equal(live.priority, 'HIGH');
  await waitFor(() => updates.some((u) => u.action === 'created' && u.unreadCount === 2));

  await inbox.markAsRead(live.id);
  await waitFor(() => updates.some((u) => u.action === 'read' && u.unreadCount === 1));
  assert.equal(await inbox.unreadCount(), 1);

  // The client acknowledged the event, so the service recorded it as DELIVERED.
  const afterAck = await server.listNotifications(userId);
  assert.ok(afterAck.data.every((n) => n.status !== 'STORED'));

  unsubscribe();
  await server.send({ userId, title: 'After disconnect', message: 'stored again' });
  const later = await inbox.list({ unread: true });
  assert.ok(later.data.some((n) => n.title === 'After disconnect'));
});

test('a revoked API key is rejected by the SDK', async () => {
  await revokeKey();
  await assert.rejects(server.send({ userId: 'x', title: 't', message: 'm' }), (e) => {
    assert.ok(e instanceof NotificationServiceError);
    assert.equal(e.status, 401);
    return true;
  });
});
