import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, NotificationRow, Paginated, qs, Recipient } from '../api';
import { ErrorBox, PageHeader, Pagination, ProjectTabs, StatCard, StatusBadge, TypeBadge } from '../components';
import { formatDate, useAsync } from '../hooks';

type Details = NotificationRow & { recipients: Paginated<Recipient> };

export function NotificationDetailsPage() {
  const { projectId, notificationId } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const details = useAsync(
    () =>
      api<Details>('GET', `/projects/${projectId}/notifications/${notificationId}${qs({ page, limit: 25, status })}`),
    [projectId, notificationId, page, status],
  );
  const n = details.data;

  async function remove() {
    if (!confirm('Delete this notification from every recipient inbox? This cannot be undone.')) return;
    try {
      await api('DELETE', `/projects/${projectId}/notifications/${notificationId}`);
      navigate(`/projects/${projectId}/notifications`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title={n?.title ?? 'Notification'}
        subtitle={<Link to={`/projects/${projectId}/notifications`}>← Back to history</Link>}
        actions={
          n && (
            <button className="danger" onClick={remove}>
              Delete for all recipients
            </button>
          )
        }
      />
      <ProjectTabs />
      <ErrorBox error={error || details.error} />
      {n && (
        <>
          <div className="card">
            <p className="message">{n.message}</p>
            <dl className="meta">
              <dt>Type</dt>
              <dd>
                <TypeBadge type={n.type} />
              </dd>
              <dt>Priority</dt>
              <dd>{n.priority}</dd>
              <dt>Target</dt>
              <dd>{n.target}</dd>
              <dt>Created</dt>
              <dd>{formatDate(n.createdAt)}</dd>
              <dt>ID</dt>
              <dd>
                <code>{n.id}</code>
              </dd>
              <dt>Metadata</dt>
              <dd>{n.metadata ? <pre className="inline-pre">{JSON.stringify(n.metadata, null, 2)}</pre> : '—'}</dd>
            </dl>
          </div>
          <div className="stats">
            <StatCard label="Recipients" value={n.recipientCount} />
            <StatCard label="Delivered" value={n.deliveredCount} hint="client acknowledged or fetched it" />
            <StatCard label="Read" value={n.readCount} />
          </div>
          <div className="card table-wrap">
            <div className="row between">
              <h3>Recipients</h3>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                aria-label="Status filter"
              >
                <option value="">All statuses</option>
                <option>STORED</option>
                <option>DELIVERED</option>
                <option>READ</option>
              </select>
            </div>
            <table>
              <thead>
                <tr>
                  <th>User id</th>
                  <th>Status</th>
                  <th>Delivered</th>
                  <th>Read</th>
                </tr>
              </thead>
              <tbody>
                {n.recipients.data.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No recipients{status && ` with status ${status}`}.
                    </td>
                  </tr>
                )}
                {n.recipients.data.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <code>{r.recipientId}</code>
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="small muted">{formatDate(r.deliveredAt)}</td>
                    <td className="small muted">{formatDate(r.readAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination meta={n.recipients.meta} onPage={setPage} />
          </div>
        </>
      )}
    </>
  );
}
