import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, NotificationRow, Paginated, PRIORITIES, qs, TARGETS, TYPES } from '../api';
import { ErrorBox, PageHeader, Pagination, ProjectTabs, TypeBadge } from '../components';
import { formatDate, useAsync } from '../hooks';
import { useProject } from './ProjectDetailsPage';

/** Notification history with filters; filter state lives in the URL so it survives reloads. */
export function NotificationsPage() {
  const { projectId } = useParams();
  const { data: project } = useProject();
  const [params, setParams] = useSearchParams();
  const filters = {
    type: params.get('type') ?? '',
    priority: params.get('priority') ?? '',
    target: params.get('target') ?? '',
    recipientId: params.get('recipientId') ?? '',
    page: Number(params.get('page') ?? 1),
  };
  const list = useAsync(
    () =>
      api<Paginated<NotificationRow>>(
        'GET',
        `/projects/${projectId}/notifications${qs({ ...filters, limit: 20 })}`,
      ),
    [projectId, params.toString()],
  );

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }

  return (
    <>
      <PageHeader title={project?.name ?? 'Project'} subtitle="Notification history" />
      <ProjectTabs />
      <div className="card filters">
        <select value={filters.type} onChange={(e) => setFilter('type', e.target.value)} aria-label="Type">
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select value={filters.priority} onChange={(e) => setFilter('priority', e.target.value)} aria-label="Priority">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select value={filters.target} onChange={(e) => setFilter('target', e.target.value)} aria-label="Target">
          <option value="">All targets</option>
          {TARGETS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFilter('recipientId', String(new FormData(e.currentTarget).get('recipientId') ?? '').trim());
          }}
        >
          <input name="recipientId" defaultValue={filters.recipientId} placeholder="Recipient user id" />
        </form>
        {params.toString() && (
          <button className="link" onClick={() => setParams(new URLSearchParams())}>
            Clear filters
          </button>
        )}
      </div>
      <ErrorBox error={list.error} />
      {list.data && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Target</th>
                <th>Recipients</th>
                <th>Delivered</th>
                <th>Read</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {list.data.data.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">
                    No notifications match.
                  </td>
                </tr>
              )}
              {list.data.data.map((n) => (
                <tr key={n.id}>
                  <td>
                    <Link to={`/projects/${projectId}/notifications/${n.id}`}>{n.title}</Link>
                  </td>
                  <td>
                    <TypeBadge type={n.type} />
                  </td>
                  <td>{n.priority}</td>
                  <td>{n.target}</td>
                  <td>{n.recipientCount}</td>
                  <td>{n.deliveredCount}</td>
                  <td>{n.readCount}</td>
                  <td className="small muted">{formatDate(n.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination meta={list.data.meta} onPage={(p) => setFilter('page', String(p))} />
        </div>
      )}
    </>
  );
}
