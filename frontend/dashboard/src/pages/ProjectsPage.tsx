import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, Project } from '../api';
import { ErrorBox, PageHeader } from '../components';
import { formatDate, useAsync } from '../hooks';

export function ProjectsPage() {
  const navigate = useNavigate();
  const { data: projects, error, loading } = useAsync(() => api<Project[]>('GET', '/projects'), []);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', description: '' });
  const [formError, setFormError] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const project = await api<Project>('POST', '/projects', {
        name: form.name,
        ...(form.slug && { slug: form.slug }),
        ...(form.description && { description: form.description }),
      });
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Each integrating application gets its own isolated project."
        actions={<button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : 'New project'}</button>}
      />
      {showForm && (
        <form className="card form" onSubmit={create}>
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} placeholder="My CRM" />
          </label>
          <label>
            Project key <span className="muted small">(optional; lowercase letters, digits, hyphens)</span>
            <input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
              pattern="[a-z0-9](?:[a-z0-9\-]{0,48}[a-z0-9])?"
              placeholder="my-crm"
            />
          </label>
          <label>
            Description
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} />
          </label>
          <ErrorBox error={formError} />
          <div>
            <button type="submit">Create project</button>
          </div>
        </form>
      )}
      <ErrorBox error={error} />
      {loading && !projects && <p className="muted">Loading…</p>}
      {projects?.length === 0 && <div className="card empty muted">No projects yet. Create one to get an API key.</div>}
      {projects && projects.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Project key</th>
                <th>Notifications</th>
                <th>End users</th>
                <th>API keys</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/projects/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>
                    <code>{p.slug}</code>
                  </td>
                  <td>{p._count?.notifications ?? 0}</td>
                  <td>{p._count?.endUsers ?? 0}</td>
                  <td>{p._count?.apiKeys ?? 0}</td>
                  <td className="muted small">{formatDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
