import request from 'supertest';
import { hashApiKey } from '../src/common/crypto';
import { createTenant, createTestApp, resetDatabase, Tenant, TestContext } from './helpers';

describe('Projects and API keys (e2e)', () => {
  let ctx: TestContext;
  let a: Tenant;
  let b: Tenant;
  const http = () => request(ctx.app.getHttpServer());
  const send = (key: string) =>
    http()
      .post('/api/v1/notifications')
      .set('x-api-key', key)
      .send({ userId: 'u1', title: 'Hi', message: 'Hello' });

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    a = await createTenant(ctx.app, 'alpha');
    b = await createTenant(ctx.app, 'beta');
  });
  afterAll(async () => ctx.app.close());

  describe('projects', () => {
    it('creates a project with a custom key and rejects a duplicate key', async () => {
      const res = await http()
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${a.token}`)
        .send({ name: 'My CRM', slug: 'my-crm', description: 'CRM integration' })
        .expect(201);
      expect(res.body).toMatchObject({ name: 'My CRM', slug: 'my-crm' });
      await http()
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${b.token}`)
        .send({ name: 'Other', slug: 'my-crm' })
        .expect(409);
    });

    it('lists only the projects of the signed-in user', async () => {
      const res = await http().get('/api/v1/projects').set('Authorization', `Bearer ${b.token}`).expect(200);
      expect(res.body.map((p: { id: string }) => p.id)).toEqual([b.projectId]);
    });

    it('updates a project', async () => {
      const res = await http()
        .patch(`/api/v1/projects/${a.projectId}`)
        .set('Authorization', `Bearer ${a.token}`)
        .send({ description: 'updated' })
        .expect(200);
      expect(res.body.description).toBe('updated');
    });

    it("hides other users' projects (404) for read, update, delete, keys and stats", async () => {
      const auth = { Authorization: `Bearer ${b.token}` };
      await http().get(`/api/v1/projects/${a.projectId}`).set(auth).expect(404);
      await http().patch(`/api/v1/projects/${a.projectId}`).set(auth).send({ name: 'x' }).expect(404);
      await http().delete(`/api/v1/projects/${a.projectId}`).set(auth).expect(404);
      await http().get(`/api/v1/projects/${a.projectId}/api-keys`).set(auth).expect(404);
      await http().post(`/api/v1/projects/${a.projectId}/api-keys`).set(auth).send({ name: 'k' }).expect(404);
      await http().delete(`/api/v1/projects/${a.projectId}/api-keys/${a.apiKeyId}`).set(auth).expect(404);
      await http().get(`/api/v1/projects/${a.projectId}/stats`).set(auth).expect(404);
      await http().get(`/api/v1/projects/${a.projectId}/notifications`).set(auth).expect(404);
    });

    it('rejects a malformed project id', async () => {
      await http().get('/api/v1/projects/not-a-uuid').set('Authorization', `Bearer ${a.token}`).expect(400);
    });
  });

  describe('API key authentication', () => {
    it('stores only a hash of the key and never returns it again', async () => {
      const stored = await ctx.prisma.apiKey.findUniqueOrThrow({ where: { id: a.apiKeyId } });
      expect(stored.keyHash).toBe(hashApiKey(a.apiKey));
      expect(JSON.stringify(stored)).not.toContain(a.apiKey);
      const list = await http()
        .get(`/api/v1/projects/${a.projectId}/api-keys`)
        .set('Authorization', `Bearer ${a.token}`)
        .expect(200);
      expect(list.body[0]).toMatchObject({ id: a.apiKeyId, prefix: a.apiKey.slice(0, 12) });
      expect(list.body[0].key).toBeUndefined();
      expect(list.body[0].keyHash).toBeUndefined();
    });

    it('rejects requests without, with malformed or with unknown keys', async () => {
      await http().post('/api/v1/notifications').send({ userId: 'u1', title: 't', message: 'm' }).expect(401);
      await send('not-a-key').expect(401);
      await send('nsk_doesnotexist').expect(401);
    });

    it('accepts the key in x-api-key or Authorization: Bearer', async () => {
      await send(a.apiKey).expect(201);
      await http()
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${a.apiKey}`)
        .send({ userId: 'u1', title: 'Hi', message: 'Hello' })
        .expect(201);
    });

    it('records lastUsedAt', async () => {
      const key = await ctx.prisma.apiKey.findUniqueOrThrow({ where: { id: a.apiKeyId } });
      expect(key.lastUsedAt).not.toBeNull();
    });

    it('does not accept a dashboard JWT as an API key', async () => {
      await send(a.token).expect(401);
    });
  });

  describe('API key revocation', () => {
    it('stops a revoked key from working while other keys keep working', async () => {
      const auth = { Authorization: `Bearer ${a.token}` };
      const second = await http()
        .post(`/api/v1/projects/${a.projectId}/api-keys`)
        .set(auth)
        .send({ name: 'second' })
        .expect(201);
      await send(second.body.key).expect(201);

      const revoked = await http()
        .delete(`/api/v1/projects/${a.projectId}/api-keys/${second.body.id}`)
        .set(auth)
        .expect(200);
      expect(revoked.body.revokedAt).not.toBeNull();

      const res = await send(second.body.key).expect(401);
      expect(res.body.message).toBe('Invalid or revoked API key');
      await send(a.apiKey).expect(201);
    });

    it('cannot revoke a key through another project', async () => {
      await http()
        .delete(`/api/v1/projects/${b.projectId}/api-keys/${a.apiKeyId}`)
        .set('Authorization', `Bearer ${b.token}`)
        .expect(404);
    });
  });
});
