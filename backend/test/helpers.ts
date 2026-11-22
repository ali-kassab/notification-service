import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/app-setup';
import { PrismaService } from '../src/common/prisma/prisma.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  baseUrl: string;
}

/** Boots the real application (same setup as main.ts) on a random port. */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
  await app.listen(0);
  const { port } = app.getHttpServer().address() as AddressInfo;
  const prisma = app.get(PrismaService);
  return { app, prisma, baseUrl: `http://127.0.0.1:${port}` };
}

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "NotificationRecipient", "Notification", "EndUser", "ApiKey", "Project", "User" CASCADE',
  );
}

let counter = 0;
const unique = () => `${Date.now()}-${++counter}`;

export interface Tenant {
  token: string; // dashboard JWT
  projectId: string;
  slug: string;
  apiKey: string;
  apiKeyId: string;
}

/** Registers a dashboard user, creates a project and an API key. */
export async function createTenant(app: INestApplication, name = 'tenant'): Promise<Tenant> {
  const http = request(app.getHttpServer());
  const reg = await http
    .post('/api/v1/auth/register')
    .send({ email: `${name}-${unique()}@example.com`, name, password: 'password123' })
    .expect(201);
  const token = reg.body.accessToken as string;
  const project = await request(app.getHttpServer())
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `${name} project` })
    .expect(201);
  const key = await request(app.getHttpServer())
    .post(`/api/v1/projects/${project.body.id}/api-keys`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'test key' })
    .expect(201);
  return {
    token,
    projectId: project.body.id,
    slug: project.body.slug,
    apiKey: key.body.key,
    apiKeyId: key.body.id,
  };
}

export async function userToken(app: INestApplication, apiKey: string, userId: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/user-tokens')
    .set('x-api-key', apiKey)
    .send({ userId })
    .expect(201);
  return res.body.token;
}

/** Connects a Socket.IO client and resolves once the server has authenticated it ("ready"). */
export function connectSocket(
  baseUrl: string,
  token: string,
  opts: { autoAck?: boolean } = { autoAck: true },
): Promise<{ socket: Socket; received: any[]; ready: any }> {
  return new Promise((resolve, reject) => {
    const socket = io(`${baseUrl}/notifications`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    const received: any[] = [];
    socket.on('notification', (payload: any, ack?: (r: unknown) => void) => {
      received.push(payload);
      if (opts.autoAck !== false && ack) ack({ ok: true });
    });
    const timer = setTimeout(() => fail(new Error('socket connect timeout')), 5000);
    const fail = (e: Error) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(e);
    };
    socket.once('ready', (ready) => {
      clearTimeout(timer);
      resolve({ socket, received, ready });
    });
    socket.once('auth_error', (e) => fail(new Error(e.message)));
    socket.once('connect_error', fail);
  });
}

/** Polls until `fn` returns a truthy value or the timeout elapses. */
export async function waitFor<T>(fn: () => Promise<T> | T, timeoutMs = 5000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
