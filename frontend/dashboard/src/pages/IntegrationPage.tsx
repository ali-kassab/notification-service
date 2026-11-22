import { Link, useParams } from 'react-router-dom';
import { API_URL } from '../api';
import { CodeBlock, PageHeader, ProjectTabs } from '../components';
import { useProject } from './ProjectDetailsPage';

export function IntegrationPage() {
  const { projectId } = useParams();
  const { data: project } = useProject();
  const slug = project?.slug ?? 'your-project-key';

  return (
    <>
      <PageHeader title={project?.name ?? 'Project'} subtitle="Integrate this project into your application." />
      <ProjectTabs />
      <div className="card prose">
        <h3>1. Create an API key</h3>
        <p>
          Generate a secret key on the <Link to={`/projects/${projectId}/api-keys`}>API keys</Link> tab and store it in your
          backend's environment (e.g. <code>NAAS_API_KEY</code>). Never ship it to browsers or mobile apps.
        </p>

        <h3>2. Install the SDK in your backend</h3>
        <CodeBlock>{`npm install notification-service-sdk
# (from this repository: npm install ../notification-service/sdk/javascript)`}</CodeBlock>

        <h3>3. Send notifications from your backend</h3>
        <CodeBlock>{`import { NotificationClient } from 'notification-service-sdk';

const notifications = new NotificationClient({
  apiKey: process.env.NAAS_API_KEY,
  baseUrl: '${API_URL}',
});

await notifications.send({
  projectKey: '${slug}',          // optional safety check
  userId: 'user-123',             // YOUR application's user id
  title: 'Payment Successful',
  message: 'Your payment was processed successfully.',
  type: 'SUCCESS',                // INFO | SUCCESS | WARNING | ERROR
  priority: 'NORMAL',             // LOW | NORMAL | HIGH
  metadata: { orderId: 42 },
});

await notifications.send({ userIds: ['u1', 'u2'], title: 'Team update', message: '...' });
await notifications.broadcast({ title: 'Maintenance tonight', message: '22:00-23:00 UTC', type: 'WARNING' });`}</CodeBlock>

        <h3>Or call the REST API directly</h3>
        <CodeBlock>{`curl -X POST ${API_URL}/api/v1/notifications \\
  -H "x-api-key: $NAAS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"projectKey":"${slug}","userId":"user-123","title":"New Task Assigned","message":"You have been assigned a new task.","type":"INFO","priority":"NORMAL"}'`}</CodeBlock>

        <h3>4. Give your logged-in users a user token</h3>
        <p>Add an endpoint to your backend that issues a short-lived token for the currently authenticated user:</p>
        <CodeBlock>{`// e.g. Express - behind YOUR existing authentication
app.post('/api/notification-token', requireLogin, async (req, res) => {
  const { token, expiresAt } = await notifications.createUserToken(req.user.id, 3600);
  res.json({ token, expiresAt });
});`}</CodeBlock>

        <h3>5. Show the inbox in the browser with real-time updates</h3>
        <CodeBlock>{`import { NotificationInbox } from 'notification-service-sdk/browser';

const inbox = new NotificationInbox({
  baseUrl: '${API_URL}',
  // Called whenever a (fresh) token is needed
  token: () => fetch('/api/notification-token', { method: 'POST' }).then(r => r.json()).then(r => r.token),
});

const { data } = await inbox.list({ unread: true });
const count = await inbox.unreadCount();

const unsubscribe = inbox.subscribe({
  onNotification: (n) => console.log('new', n.title),
  onInboxUpdated: (u) => console.log('unread now', u.unreadCount),
});

await inbox.markAsRead(data[0].id);
await inbox.markAllAsRead();`}</CodeBlock>
        <p className="muted small">
          A user token only grants access to that one user's inbox in this project. It cannot send notifications.
          Notifications are stored before real-time delivery, so users who are offline see them when they come back.
        </p>
      </div>
    </>
  );
}
