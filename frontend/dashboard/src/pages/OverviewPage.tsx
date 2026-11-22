import { Link } from 'react-router-dom';
import { api, Stats } from '../api';
import { ErrorBox, PageHeader, StatCard, TypeBadge } from '../components';
import { formatDate, useAsync } from '../hooks';
import { TypeBreakdown } from './ProjectDetailsPage';

export function OverviewPage() {
  const { data: stats, error } = useAsync(() => api<Stats>('GET', '/stats/overview'), []);

  return (
    <>
      <PageHeader title="Overview" subtitle="Activity across all of your projects." />
      <ErrorBox error={error} />
      {stats && (
        <>
          <div className="stats">
            <StatCard label="Projects" value={stats.projectCount ?? 0} />
            <StatCard label="Notifications sent" value={stats.notifications} hint="distinct sends" />
            <StatCard label="Inbox entries" value={stats.recipients.total} hint="one per recipient" />
            <StatCard label="Read" value={stats.recipients.read} />
            <StatCard label="Unread" value={stats.recipients.unread} />
            <StatCard label="Delivered" value={stats.recipients.delivered} hint="acknowledged by a client" />
          </div>

          {stats.projectCount === 0 && (
            <div className="card empty">
              <p>You have no projects yet.</p>
              <Link className="button" to="/projects">
                Create your first project
              </Link>
            </div>
          )}

          <div className="grid-2">
            <section className="card">
              <h3>Notification types</h3>
              <TypeBreakdown byType={stats.byType} />
            </section>
            <section className="card">
              <h3>Recent notifications</h3>
              {stats.recent.length === 0 && <p className="muted">Nothing sent yet.</p>}
              <ul className="simple-list">
                {stats.recent.map((n) => (
                  <li key={n.id}>
                    <Link to={`/projects/${n.projectId}/notifications/${n.id}`}>
                      <TypeBadge type={n.type} /> {n.title}
                    </Link>
                    <span className="muted small">
                      {n.project?.name} · {formatDate(n.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </>
  );
}
