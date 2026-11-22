import { Socket } from 'socket.io-client';
import request from 'supertest';
import {
  connectSocket,
  createTenant,
  createTestApp,
  resetDatabase,
  sleep,
  Tenant,
  TestContext,
  userToken,
  waitFor,
} from './helpers';

describe('Real-time delivery over Socket.IO (e2e)', () => {
  let ctx: TestContext;
  let a: Tenant;
  let b: Tenant;
  const sockets: Socket[] = [];
  const http = () => request(ctx.app.getHttpServer());

  async function connect(t: Tenant, userId: string, autoAck = true) {
    const conn = await connectSocket(ctx.baseUrl, await userToken(ctx.app, t.apiKey, userId), { autoAck });
    sockets.push(conn.socket);
    return conn;
  }

  async function send(t: Tenant, userId: string, title = 'Hello') {
    const res = await http()
      .post('/api/v1/notifications')
      .set('x-api-key', t.apiKey)
      .send({ userId, title, message: 'Real-time message' })
      .expect(201);
    return res.body.id as string;
  }

  const recipientRow = (notificationId: string) =>
    ctx.prisma.notificationRecipient.findFirstOrThrow({ where: { notificationId } });

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    a = await createTenant(ctx.app, 'alpha');
    b = await createTenant(ctx.app, 'beta');
  });
  afterEach(() => {
    sockets.splice(0).forEach((s) => s.disconnect());
  });
  afterAll(async () => ctx.app.close());

  it('rejects connections without a valid user token', async () => {
    await expect(connectSocket(ctx.baseUrl, 'invalid')).rejects.toThrow();
    // A dashboard JWT or an API key is not a user token either.
    await expect(connectSocket(ctx.baseUrl, a.token)).rejects.toThrow();
    await expect(connectSocket(ctx.baseUrl, a.apiKey)).rejects.toThrow();
  });

  it('reports the unread count on connect', async () => {
    await send(a, 'counter-user');
    const { ready } = await connect(a, 'counter-user');
    expect(ready).toEqual({ userId: 'counter-user', unreadCount: 1 });
  });

  it('delivers in real time to the recipient and marks it DELIVERED after the client ack', async () => {
    const alice = await connect(a, 'alice');
    const id = await send(a, 'alice', 'Payment received');
    const item = await waitFor(() => alice.received.find((n) => n.notificationId === id));
    expect(item).toMatchObject({ title: 'Payment received', userId: 'alice', projectId: a.projectId });
    const row = await waitFor(async () => {
      const r = await recipientRow(id);
      return r.status === 'DELIVERED' ? r : null;
    });
    expect(row!.deliveredAt).not.toBeNull();
  });

  it('isolates rooms: other users and the same user id in another project receive nothing', async () => {
    const alice = await connect(a, 'alice');
    const bob = await connect(a, 'bob');
    const aliceInB = await connect(b, 'alice'); // same external id, different project

    const id = await send(a, 'alice', 'Only for alice in project A');
    await waitFor(() => alice.received.some((n) => n.notificationId === id));
    await sleep(300);
    expect(bob.received).toHaveLength(0);
    expect(aliceInB.received).toHaveLength(0);

    const idB = await send(b, 'alice', 'Only for alice in project B');
    await waitFor(() => aliceInB.received.some((n) => n.notificationId === idB));
    await sleep(300);
    expect(alice.received.some((n) => n.notificationId === idB)).toBe(false);
  });

  it('delivers broadcasts only to connected users of the same project', async () => {
    const carol = await connect(a, 'carol');
    const dave = await connect(b, 'dave');
    const res = await http()
      .post('/api/v1/notifications/broadcast')
      .set('x-api-key', a.apiKey)
      .send({ title: 'Broadcast A', message: 'Hi all' })
      .expect(201);
    await waitFor(() => carol.received.some((n) => n.notificationId === res.body.id));
    await sleep(300);
    expect(dave.received).toHaveLength(0);
  });

  it('delivers to every open tab of the same user', async () => {
    const tab1 = await connect(a, 'erin');
    const tab2 = await connect(a, 'erin');
    const id = await send(a, 'erin');
    await waitFor(() => tab1.received.some((n) => n.notificationId === id));
    await waitFor(() => tab2.received.some((n) => n.notificationId === id));
  });

  it('does not claim delivery when the client never acknowledges', async () => {
    const silent = await connect(a, 'silent', false);
    const id = await send(a, 'silent');
    await waitFor(() => silent.received.some((n) => n.notificationId === id));
    await sleep(500);
    expect((await recipientRow(id)).status).toBe('STORED');
  });

  it('persists notifications for offline users and serves them after reconnecting', async () => {
    const id = await send(a, 'offline-user', 'Sent while offline');
    await sleep(200);
    const row = await recipientRow(id);
    expect(row.status).toBe('STORED'); // nothing was emitted, nothing claimed

    const conn = await connect(a, 'offline-user');
    expect(conn.ready.unreadCount).toBe(1);
    const token = await userToken(ctx.app, a.apiKey, 'offline-user');
    const inbox = await http()
      .get('/api/v1/client/notifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(inbox.body.data[0]).toMatchObject({ notificationId: id, title: 'Sent while offline', read: false });
    expect((await recipientRow(id)).status).toBe('DELIVERED');
  });

  it('pushes inbox_updated with the new unread count after read operations', async () => {
    const frank = await connect(a, 'frank');
    const updates: any[] = [];
    frank.socket.on('inbox_updated', (u) => updates.push(u));
    const id = await send(a, 'frank');
    await waitFor(() => updates.some((u) => u.action === 'created' && u.unreadCount === 1));

    const row = await recipientRow(id);
    const token = await userToken(ctx.app, a.apiKey, 'frank');
    await http()
      .patch(`/api/v1/client/notifications/${row.id}/read`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const update = await waitFor(() => updates.find((u) => u.action === 'read'));
    expect(update).toEqual({ action: 'read', ids: [row.id], unreadCount: 0 });
  });
});
