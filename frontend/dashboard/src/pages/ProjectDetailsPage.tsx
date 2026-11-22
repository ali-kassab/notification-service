import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, Project, Stats, TYPES } from '../api';
import { ErrorBox, PageHeader, ProjectTabs, StatCard, TypeBadge } from '../components';
import { formatDate, useAsync } from '../hooks';

export function useProject() {
  const { projectId } = useParams();
  return useAsync(() => api<Project>('GET', `/projects/${projectId}`), [projectId]);
}

export function TypeBreakdown({ byType }: { byType: Stats['byType'] }) {
  const max = Math.max(1, ...TYPES.map((t) => byType[t].recipients));
  return (
    <div className="bars">
      {TYPES.map((t) => (
        <div key={t} className="bar-row">
          <TypeBadge type={t} />
          <div className="bar">
            <div className={`bar-fill type-${t.toLowerCase()}`} style={{ width: `${(byType[t].recipients / max) * 100}%` }} />
          </div>
          <span className="small muted">
            {byType[t].notifications} sent · {byType[t].recipients} recipients
          </span>
        </div>
      ))}
    </div>
  );
}

export function ProjectDetailsPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { data: project, error, setData } = useProject();
  const stats = useAsync(() => api<Stats>('GET', `/projects/${projectId}/stats`), [projectId]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [actionError, setActionError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      setData(await api<Project>('PATCH', `/projects/${projectId}`, form));
      setEditing(false);
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  async function remove() {
    if (!project) return;
    if (!confirm(`Delete project "${project.name}" and ALL of its notifications and API keys? This cannot be undone.`)) return;
    try {
      await api('DELETE', `/projects/${projectId}`);
      navigate('/projects');
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  return (
    <>
      <ErrorBox error={error} />
      {project && (
        <>
          <PageHeader
            title={project.name}
            subtitle={
              <>
                Project key <code>{project.slug}</code> · created {formatDate(project.createdAt)}
              </>
            }
            actions={
              <>
                <button
                  className="secondary"
                  onClick={() => {
                    setForm({ name: project.name, description: project.description ?? '' });
                    setEditing((v) => !v);
                  }}
                >
                  {editing ? 'Cancel' : 'Edit'}
                </button>
                <button className="danger" onClick={remove}>
                  Delete
                </button>
              </>
            }
          />
          <ProjectTabs />
          <ErrorBox error={actionError} />
          {editing && (
            <form className="card form" onSubmit={save}>
              <label>
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} />
              </label>
              <label>
                Description
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} />
              </label>
              <div>
                <button type="submit">Save</button>
              </div>
            </form>
          )}
          {project.description && <p>{project.description}</p>}
        </>
      )}
      <ErrorBox error={stats.error} />
      {stats.data && (
        <>
          <div className="stats">
            <StatCard label="Notifications sent" value={stats.data.notifications} />
            <StatCard label="Inbox entries" value={stats.data.recipients.total} />
            <StatCard label="Read" value={stats.data.recipients.read} />
            <StatCard label="Unread" value={stats.data.recipients.unread} />
            <StatCard label="Delivered" value={stats.data.recipients.delivered} hint="acknowledged by a client" />
            <StatCard label="Known end users" value={stats.data.endUsers} hint="broadcast audience" />
          </div>
          <div className="grid-2">
            <section className="card">
              <h3>Notification types</h3>
              <TypeBreakdown byType={stats.data.byType} />
            </section>
            <section className="card">
              <h3>Recent notifications</h3>
              {stats.data.recent.length === 0 && (
                <p className="muted">
                  Nothing sent yet. <Link to={`/projects/${projectId}/send`}>Send a test notification</Link>.
                </p>
              )}
              <ul className="simple-list">
                {stats.data.recent.map((n) => (
                  <li key={n.id}>
                    <Link to={`/projects/${projectId}/notifications/${n.id}`}>
                      <TypeBadge type={n.type} /> {n.title}
                    </Link>
                    <span className="muted small">{formatDate(n.createdAt)}</span>
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
