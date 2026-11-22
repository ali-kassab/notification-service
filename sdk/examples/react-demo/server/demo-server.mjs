// "Your application's backend" - a tiny stand-in for e.g. a CRM or shop server.
// It is the ONLY place that knows the secret project API key.
//
//   NAAS_API_KEY=nsk_... NAAS_BASE_URL=http://localhost:3000 npm run server
//
// Endpoints used by the demo frontend (proxied by Vite under /api):
//   POST /api/login        { userId }                -> { userId, token, expiresAt }  (demo login)
//   POST /api/token        (x-demo-user header)      -> { token, expiresAt }          (token refresh)
//   POST /api/place-order  (x-demo-user header)      -> sends a notification via the SDK
import { createServer } from 'node:http';
import { NotificationClient } from 'notification-service-sdk';

const apiKey = process.env.NAAS_API_KEY;
const baseUrl = process.env.NAAS_BASE_URL ?? 'http://localhost:3000';
const port = Number(process.env.DEMO_SERVER_PORT ?? 4000);
if (!apiKey) {
  console.error('Set NAAS_API_KEY to a project API key created in the dashboard.');
  process.exit(1);
}

const notifications = new NotificationClient({ apiKey, baseUrl });

// A real app would use its own session/auth. For the demo, any user id matching this pattern can "log in".
const USER_ID = /^[A-Za-z0-9._-]{1,64}$/;

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw Object.assign(new Error('Body too large'), { status: 413 });
  }
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function currentUser(req) {
  const id = req.headers['x-demo-user'];
  if (typeof id !== 'string' || !USER_ID.test(id)) throw Object.assign(new Error('Not logged in'), { status: 401 });
  return id;
}

let orderNo = 1000;

createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/login') {
      const { userId } = await readJson(req);
      if (typeof userId !== 'string' || !USER_ID.test(userId)) return send(res, 400, { message: 'Invalid user id' });
      const token = await notifications.createUserToken(userId, 900);
      return send(res, 200, token);
    }
    if (req.method === 'POST' && req.url === '/api/token') {
      return send(res, 200, await notifications.createUserToken(currentUser(req), 900));
    }
    if (req.method === 'POST' && req.url === '/api/place-order') {
      const userId = currentUser(req);
      const order = ++orderNo;
      // The business event happens here; the app notifies the user through the SDK.
      const result = await notifications.send({
        userId,
        title: `Order #${order} confirmed`,
        message: 'Your payment was processed successfully.',
        type: 'SUCCESS',
        metadata: { orderId: order },
      });
      return send(res, 201, { order, notification: result });
    }
    send(res, 404, { message: 'Not found' });
  } catch (e) {
    send(res, e.status ?? 500, { message: e.message });
  }
}).listen(port, () => console.log(`Demo app backend on http://localhost:${port} -> NaaS at ${baseUrl}`));
