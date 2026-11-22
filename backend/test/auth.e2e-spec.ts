import request from 'supertest';
import { createTenant, createTestApp, resetDatabase, TestContext, userToken } from './helpers';

describe('Authentication (e2e)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
  });
  afterAll(async () => ctx.app.close());

  it('registers, logs in and returns the current user', async () => {
    const reg = await http()
      .post('/api/v1/auth/register')
      .send({ email: 'Alice@Example.com', name: 'Alice', password: 'password123' })
      .expect(201);
    expect(reg.body.accessToken).toEqual(expect.any(String));
    expect(reg.body.user).toMatchObject({ email: 'alice@example.com', name: 'Alice' });
    expect(reg.body.user.passwordHash).toBeUndefined();

    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'alice@example.com', password: 'password123' })
      .expect(200);

    const me = await http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe('alice@example.com');
  });

  it('stores a bcrypt hash, never the plain password', async () => {
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'alice@example.com' } });
    expect(user.passwordHash).not.toContain('password123');
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('rejects duplicate registration', async () => {
    await http()
      .post('/api/v1/auth/register')
      .send({ email: 'alice@example.com', name: 'Alice 2', password: 'password123' })
      .expect(409);
  });

  it('rejects a wrong password and an unknown email with the same error', async () => {
    const wrong = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'alice@example.com', password: 'nope-nope' })
      .expect(401);
    const unknown = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'nope-nope' })
      .expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('returns validation errors in the consistent error format', async () => {
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', name: '', password: 'short', extra: 'x' })
      .expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      path: '/api/v1/auth/register',
    });
    expect(Array.isArray(res.body.message)).toBe(true);
    expect(res.body.timestamp).toEqual(expect.any(String));
  });

  it('rejects protected dashboard routes without or with an invalid token', async () => {
    await http().get('/api/v1/projects').expect(401);
    await http().get('/api/v1/projects').set('Authorization', 'Bearer garbage').expect(401);
  });

  it('does not accept an end-user token as a dashboard token (and vice versa)', async () => {
    const tenant = await createTenant(ctx.app, 'tokens');
    const endUserToken = await userToken(ctx.app, tenant.apiKey, 'user-1');
    await http().get('/api/v1/projects').set('Authorization', `Bearer ${endUserToken}`).expect(401);
    await http()
      .get('/api/v1/client/notifications')
      .set('Authorization', `Bearer ${tenant.token}`)
      .expect(401);
  });
});
