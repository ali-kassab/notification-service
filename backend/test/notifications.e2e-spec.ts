import request from 'supertest';
import { createTenant, createTestApp, resetDatabase, Tenant, TestContext, userToken } from './helpers';

describe('Notifications REST API (e2e)', () => {
  let ctx: TestContext;
  let a: Tenant;
  let b: Tenant;
  const http = () => request(ctx.app.getHttpServer());
  const asProject = (t: Tenant) => ({ 'x-api-key': t.apiKey });

  async function sendTo(t: Tenant, body: Record<string, unknown>) {
    return http()
      .post('/api/v1/notifications')
      .set(asProject(t))
      .send({ title: 'Title', message: 'Message', ...body })
      .expect(201);
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    a = await createTenant(ctx.app, 'alpha');
    b = await createTenant(ctx.app, 'beta');
  });
  afterAll(async () => ctx.app.close());

  describe('creating notifications', () => {
    it('creates a notification for one user and persists it', async () => {
      const res = await http()
        .post('/api/v1/notifications')
        .set(asProject(a))
        .send({
          projectKey: a.slug,
          userId: 'user-123',
          title: 'New Task Assigned',
          message: 'You have been assigned a new task.',
          type: 'INFO',
          priority: 'NORMAL',
          metadata: { taskId: 't-1' },
        })
        .expect(201);
      expect(res.body).toMatchObject({ id: expect.any(String), status: 'CREATED', target: 'USER', recipientCount: 1 });

      const stored = await ctx.prisma.notificationRecipient.findFirstOrThrow({
        where: { notificationId: res.body.id },
        include: { notification: true },
      });
      expect(stored).toMatchObject({ projectId: a.projectId, recipientId: 'user-123', status: 'STORED', readAt: null });
      expect(stored.notification.metadata).toEqual({ taskId: 't-1' });
    });

    it('defaults type to INFO and priority to NORMAL', async () => {
      const res = await sendTo(a, { userId: 'defaults-user' });
      const n = await ctx.prisma.notification.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(n).toMatchObject({ type: 'INFO', priority: 'NORMAL' });
    });

    it('rejects a projectKey that does not match the API key', async () => {
      await http()
        .post('/api/v1/notifications')
        .set(asProject(a))
        .send({ projectKey: b.slug, userId: 'u', title: 't', message: 'm' })
        .expect(403);
    });

    it('validates input', async () => {
      const cases = [
        { title: 't', message: 'm' }, // no recipient
        { userId: 'u', userIds: ['v'], title: 't', message: 'm' }, // both
        { userId: 'u', title: '', message: 'm' },
        { userId: 'u', title: 't', message: 'm', type: 'CRITICAL' },
        { userId: 'u', title: 't', message: 'm', priority: 'URGENT' },
        { userId: 'bad user id with spaces', title: 't', message: 'm' },
        { userIds: [], title: 't', message: 'm' },
        { userId: 'u', title: 't', message: 'm', metadata: 'not-an-object' },
        { userId: 'u', title: 't', message: 'm', metadata: { big: 'x'.repeat(9000) } },
        { userId: 'u', title: 't', message: 'm', unknownField: true },
      ];
      for (const body of cases) {
        const res = await http().post('/api/v1/notifications').set(asProject(a)).send(body);
        expect({ body, status: res.status }).toEqual({ body, status: 400 });
      }
    });

    it('sends to multiple users (deduplicated), storing the content once', async () => {
      const res = await sendTo(a, { userIds: ['m1', 'm2', 'm3', 'm2'], type: 'SUCCESS' });
      expect(res.body).toMatchObject({ target: 'USERS', recipientCount: 3 });
      const rows = await ctx.prisma.notificationRecipient.findMany({ where: { notificationId: res.body.id } });
      expect(rows.map((r) => r.recipientId).sort()).toEqual(['m1', 'm2', 'm3']);
      expect(await ctx.prisma.notification.count({ where: { id: res.body.id } })).toBe(1);
    });

    it('broadcasts to every known end user of the project only', async () => {
      await sendTo(b, { userId: 'beta-only-user' });
      await userToken(ctx.app, a.apiKey, 'token-only-user'); // known via user token
      const res = await http()
        .post('/api/v1/notifications/broadcast')
        .set(asProject(a))
        .send({ title: 'Maintenance', message: 'Tonight 22:00', type: 'WARNING', priority: 'HIGH' })
        .expect(201);
      expect(res.body.target).toBe('BROADCAST');

      const rows = await ctx.prisma.notificationRecipient.findMany({ where: { notificationId: res.body.id } });
      const recipients = rows.map((r) => r.recipientId);
      expect(recipients).toEqual(
        expect.arrayContaining(['user-123', 'defaults-user', 'm1', 'm2', 'm3', 'token-only-user']),
      );
      expect(recipients).not.toContain('beta-only-user');
      expect(rows.every((r) => r.projectId === a.projectId)).toBe(true);
      expect(res.body.recipientCount).toBe(rows.length);
    });
  });

  describe('retrieval and read state (server-side API)', () => {
    const inbox = (t: Tenant, userId: string) => `/api/v1/users/${userId}/notifications`;
    let ids: string[];

    beforeAll(async () => {
      for (let i = 1; i <= 5; i++) {
        await sendTo(a, { userId: 'reader', title: `N${i}` });
      }
      const res = await http().get(inbox(a, 'reader')).set(asProject(a)).expect(200);
      ids = res.body.data.map((n: { id: string }) => n.id);
    });

    it('lists the inbox newest first with pagination', async () => {
      const page1 = await http().get(`${inbox(a, 'reader')}?page=1&limit=2`).set(asProject(a)).expect(200);
      expect(page1.body.meta).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });
      expect(page1.body.data.map((n: { title: string }) => n.title)).toEqual(['N5', 'N4']);
      const page3 = await http().get(`${inbox(a, 'reader')}?page=3&limit=2`).set(asProject(a)).expect(200);
      expect(page3.body.data.map((n: { title: string }) => n.title)).toEqual(['N1']);
      expect(page1.body.data[0]).toMatchObject({ userId: 'reader', read: false, status: 'STORED', type: 'INFO' });
    });

    it('rejects invalid pagination', async () => {
      await http().get(`${inbox(a, 'reader')}?limit=1000`).set(asProject(a)).expect(400);
      await http().get(`${inbox(a, 'reader')}?page=0`).set(asProject(a)).expect(400);
    });

    it('returns the unread count', async () => {
      const res = await http().get(`${inbox(a, 'reader')}/unread-count`).set(asProject(a)).expect(200);
      expect(res.body).toEqual({ count: 5 });
    });

    it('marks one notification as read (idempotently)', async () => {
      const res = await http().patch(`${inbox(a, 'reader')}/${ids[0]}/read`).set(asProject(a)).expect(200);
      expect(res.body).toMatchObject({ id: ids[0], read: true, status: 'READ', readAt: expect.any(String) });
      const again = await http().patch(`${inbox(a, 'reader')}/${ids[0]}/read`).set(asProject(a)).expect(200);
      expect(again.body.readAt).toBe(res.body.readAt);
      const count = await http().get(`${inbox(a, 'reader')}/unread-count`).set(asProject(a)).expect(200);
      expect(count.body.count).toBe(4);
    });

    it('filters unread and read notifications', async () => {
      const unread = await http().get(`${inbox(a, 'reader')}?unread=true`).set(asProject(a)).expect(200);
      expect(unread.body.meta.total).toBe(4);
      const read = await http().get(`${inbox(a, 'reader')}?unread=false`).set(asProject(a)).expect(200);
      expect(read.body.data.map((n: { id: string }) => n.id)).toEqual([ids[0]]);
    });

    it('marks all as read', async () => {
      const res = await http().patch(`${inbox(a, 'reader')}/read-all`).set(asProject(a)).expect(200);
      expect(res.body).toEqual({ updated: 4 });
      const count = await http().get(`${inbox(a, 'reader')}/unread-count`).set(asProject(a)).expect(200);
      expect(count.body.count).toBe(0);
      const history = await http().get(inbox(a, 'reader')).set(asProject(a)).expect(200);
      expect(history.body.meta.total).toBe(5); // history keeps read notifications
    });

    it('deletes a notification from the inbox', async () => {
      await http().delete(`${inbox(a, 'reader')}/${ids[1]}`).set(asProject(a)).expect(204);
      await http().delete(`${inbox(a, 'reader')}/${ids[1]}`).set(asProject(a)).expect(404);
      const history = await http().get(inbox(a, 'reader')).set(asProject(a)).expect(200);
      expect(history.body.meta.total).toBe(4);
    });

    it("cannot touch another user's notification by id", async () => {
      await http().patch(`${inbox(a, 'someone-else')}/${ids[2]}/read`).set(asProject(a)).expect(404);
      await http().delete(`${inbox(a, 'someone-else')}/${ids[2]}`).set(asProject(a)).expect(404);
    });
  });

  describe('project isolation', () => {
    it("never lets one project read or modify another project's notifications", async () => {
      const sent = await sendTo(a, { userId: 'shared-id' });
      const row = await ctx.prisma.notificationRecipient.findFirstOrThrow({ where: { notificationId: sent.body.id } });
      const path = '/api/v1/users/shared-id/notifications';

      const list = await http().get(path).set(asProject(b)).expect(200);
      expect(list.body.data).toEqual([]);
      const count = await http().get(`${path}/unread-count`).set(asProject(b)).expect(200);
      expect(count.body.count).toBe(0);
      await http().patch(`${path}/${row.id}/read`).set(asProject(b)).expect(404);
      await http().delete(`${path}/${row.id}`).set(asProject(b)).expect(404);
      const markAll = await http().patch(`${path}/read-all`).set(asProject(b)).expect(200);
      expect(markAll.body.updated).toBe(0);

      const after = await ctx.prisma.notificationRecipient.findUniqueOrThrow({ where: { id: row.id } });
      expect(after.readAt).toBeNull();
    });

    it("does not expose another project's notifications through the dashboard", async () => {
      const sent = await sendTo(a, { userId: 'x' });
      await http()
        .get(`/api/v1/projects/${b.projectId}/notifications/${sent.body.id}`)
        .set('Authorization', `Bearer ${b.token}`)
        .expect(404);
      await http()
        .delete(`/api/v1/projects/${b.projectId}/notifications/${sent.body.id}`)
        .set('Authorization', `Bearer ${b.token}`)
        .expect(404);
    });
  });

  describe('browser client API (user token)', () => {
    let tokenA1: string;

    beforeAll(async () => {
      await sendTo(a, { userId: 'client-1', title: 'For client 1' });
      await sendTo(a, { userId: 'client-2', title: 'For client 2' });
      tokenA1 = await userToken(ctx.app, a.apiKey, 'client-1');
    });

    it('only returns the inbox of the token owner and marks fetched items DELIVERED', async () => {
      const res = await http()
        .get('/api/v1/client/notifications')
        .set('Authorization', `Bearer ${tokenA1}`)
        .expect(200);
      expect(res.body.data.map((n: { title: string }) => n.title)).toEqual(['For client 1']);
      expect(res.body.data[0]).toMatchObject({ userId: 'client-1', status: 'DELIVERED' });
      expect(res.body.data[0].deliveredAt).toEqual(expect.any(String));
    });

    it("cannot mark or delete another user's notification", async () => {
      const other = await ctx.prisma.notificationRecipient.findFirstOrThrow({
        where: { projectId: a.projectId, recipientId: 'client-2' },
      });
      const auth = { Authorization: `Bearer ${tokenA1}` };
      await http().patch(`/api/v1/client/notifications/${other.id}/read`).set(auth).expect(404);
      await http().delete(`/api/v1/client/notifications/${other.id}`).set(auth).expect(404);
    });

    it('supports unread count, mark read and mark all read', async () => {
      const auth = { Authorization: `Bearer ${tokenA1}` };
      await sendTo(a, { userId: 'client-1', title: 'Second' });
      expect((await http().get('/api/v1/client/notifications/unread-count').set(auth)).body.count).toBe(2);
      const list = await http().get('/api/v1/client/notifications?unread=true').set(auth).expect(200);
      await http().patch(`/api/v1/client/notifications/${list.body.data[0].id}/read`).set(auth).expect(200);
      expect((await http().get('/api/v1/client/notifications/unread-count').set(auth)).body.count).toBe(1);
      await http().patch('/api/v1/client/notifications/read-all').set(auth).expect(200);
      expect((await http().get('/api/v1/client/notifications/unread-count').set(auth)).body.count).toBe(0);
    });

    it('has no send capability and rejects the user token on server-side routes', async () => {
      const auth = { Authorization: `Bearer ${tokenA1}` };
      await http().post('/api/v1/client/notifications').set(auth).send({ title: 't', message: 'm' }).expect(404);
      await http()
        .post('/api/v1/notifications')
        .set(auth)
        .send({ userId: 'client-1', title: 't', message: 'm' })
        .expect(401);
    });

    it('rejects missing, invalid and expired user tokens', async () => {
      await http().get('/api/v1/client/notifications').expect(401);
      await http().get('/api/v1/client/notifications').set('Authorization', 'Bearer x.y.z').expect(401);
      const jwt = ctx.app.get(require('@nestjs/jwt').JwtService);
      const expired = jwt.sign(
        { sub: 'client-1', pid: a.projectId, exp: Math.floor(Date.now() / 1000) - 10 },
        { secret: process.env.USER_TOKEN_SECRET, audience: 'naas-end-user' },
      );
      await http().get('/api/v1/client/notifications').set('Authorization', `Bearer ${expired}`).expect(401);
    });
  });

  describe('dashboard (admin) API', () => {
    const auth = () => ({ Authorization: `Bearer ${a.token}` });

    it('lists notification history with filters and read counts', async () => {
      const all = await http().get(`/api/v1/projects/${a.projectId}/notifications`).set(auth()).expect(200);
      expect(all.body.meta.total).toBeGreaterThan(5);
      expect(all.body.data[0]).toEqual(
        expect.objectContaining({ readCount: expect.any(Number), deliveredCount: expect.any(Number) }),
      );

      const warnings = await http()
        .get(`/api/v1/projects/${a.projectId}/notifications?type=WARNING`)
        .set(auth())
        .expect(200);
      expect(warnings.body.data.every((n: { type: string }) => n.type === 'WARNING')).toBe(true);
      expect(warnings.body.meta.total).toBe(1);

      const byRecipient = await http()
        .get(`/api/v1/projects/${a.projectId}/notifications?recipientId=reader`)
        .set(auth())
        .expect(200);
      expect(byRecipient.body.data.every((n: { target: string }) => ['USER', 'BROADCAST'].includes(n.target))).toBe(true);
    });

    it('shows notification details with recipients', async () => {
      const sent = await sendTo(a, { userIds: ['d1', 'd2'] });
      const res = await http()
        .get(`/api/v1/projects/${a.projectId}/notifications/${sent.body.id}`)
        .set(auth())
        .expect(200);
      expect(res.body).toMatchObject({ id: sent.body.id, recipientCount: 2, readCount: 0 });
      expect(res.body.recipients.data.map((r: { recipientId: string }) => r.recipientId)).toEqual(['d1', 'd2']);
    });

    it('sends test notifications from the dashboard (single and broadcast)', async () => {
      const single = await http()
        .post(`/api/v1/projects/${a.projectId}/notifications`)
        .set(auth())
        .send({ userId: 'dash-user', title: 'Test', message: 'From dashboard', type: 'SUCCESS' })
        .expect(201);
      expect(single.body.status).toBe('CREATED');
      const bc = await http()
        .post(`/api/v1/projects/${a.projectId}/notifications`)
        .set(auth())
        .send({ broadcast: true, title: 'Test', message: 'Everyone' })
        .expect(201);
      expect(bc.body.target).toBe('BROADCAST');
      expect(bc.body.recipientCount).toBeGreaterThan(5);
    });

    it('returns project statistics', async () => {
      const res = await http().get(`/api/v1/projects/${a.projectId}/stats`).set(auth()).expect(200);
      expect(res.body.recipients.total).toBe(res.body.recipients.read + res.body.recipients.unread);
      expect(res.body.byType.WARNING.notifications).toBe(1);
      expect(res.body.recent).toHaveLength(5);
      const overview = await http().get('/api/v1/stats/overview').set(auth()).expect(200);
      expect(overview.body.projectCount).toBe(1);
      expect(overview.body.notifications).toBe(res.body.notifications);
    });

    it('deletes a notification for all recipients', async () => {
      const sent = await sendTo(a, { userIds: ['del1', 'del2'] });
      await http().delete(`/api/v1/projects/${a.projectId}/notifications/${sent.body.id}`).set(auth()).expect(204);
      expect(await ctx.prisma.notificationRecipient.count({ where: { notificationId: sent.body.id } })).toBe(0);
    });
  });
});
