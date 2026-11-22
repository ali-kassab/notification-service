// Unit tests for the SDK request layer (no server needed). Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NotificationClient, NotificationInbox, NotificationServiceError } from '../dist/index.js';

function mockFetch(responses) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, ...init, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    const next = responses.shift() ?? { status: 200, body: {} };
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), { status: next.status });
  };
  return { fetch, calls };
}

test('NotificationClient.send posts to /api/v1/notifications with the API key', async () => {
  const { fetch, calls } = mockFetch([{ status: 201, body: { id: 'n1', status: 'CREATED' } }]);
  const client = new NotificationClient({ apiKey: 'nsk_test', baseUrl: 'https://naas.example.com/', fetch });
  const res = await client.send({ userId: 'user-123', title: 'Hi', message: 'Hello', type: 'SUCCESS' });

  assert.deepEqual(res, { id: 'n1', status: 'CREATED' });
  assert.equal(calls[0].url, 'https://naas.example.com/api/v1/notifications');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers['x-api-key'], 'nsk_test');
  assert.deepEqual(calls[0].body, { userId: 'user-123', title: 'Hi', message: 'Hello', type: 'SUCCESS' });
});

test('NotificationClient builds user inbox URLs with encoded ids and query strings', async () => {
  const { fetch, calls } = mockFetch([
    { status: 200, body: { data: [], meta: {} } },
    { status: 200, body: { count: 3 } },
    { status: 204 },
  ]);
  const client = new NotificationClient({ apiKey: 'nsk_test', baseUrl: 'http://x', fetch });
  await client.listNotifications('a b', { unread: true, page: 2 });
  assert.equal(await client.getUnreadCount('u1'), 3);
  await client.deleteNotification('u1', 'id-1');

  assert.equal(calls[0].url, 'http://x/api/v1/users/a%20b/notifications?unread=true&page=2');
  assert.equal(calls[1].url, 'http://x/api/v1/users/u1/notifications/unread-count');
  assert.equal(calls[2].method, 'DELETE');
});

test('errors are thrown as NotificationServiceError with status and message', async () => {
  const { fetch } = mockFetch([{ status: 400, body: { statusCode: 400, message: ['title should not be empty'] } }]);
  const client = new NotificationClient({ apiKey: 'nsk_test', baseUrl: 'http://x', fetch });
  await assert.rejects(client.send({ userId: 'u', title: '', message: 'm' }), (e) => {
    assert.ok(e instanceof NotificationServiceError);
    assert.equal(e.status, 400);
    assert.equal(e.message, 'title should not be empty');
    return true;
  });
});

test('NotificationInbox refuses secret API keys', () => {
  assert.throws(() => new NotificationInbox({ token: 'nsk_secret', baseUrl: 'http://x' }), /secret API key/);
});

test('NotificationInbox uses a bearer user token and refreshes it once on 401', async () => {
  const { fetch, calls } = mockFetch([
    { status: 401, body: { message: 'Invalid or expired user token' } },
    { status: 200, body: { count: 1 } },
  ]);
  const tokens = ['expired', 'fresh'];
  const inbox = new NotificationInbox({ baseUrl: 'http://x', fetch, token: async () => tokens.shift() });

  assert.equal(await inbox.unreadCount(), 1);
  assert.equal(calls[0].headers.Authorization, 'Bearer expired');
  assert.equal(calls[1].headers.Authorization, 'Bearer fresh');
  assert.equal(calls[1].url, 'http://x/api/v1/client/notifications/unread-count');
});
