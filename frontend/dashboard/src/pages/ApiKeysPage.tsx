import { FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiKey } from '../api';
import { CodeBlock, ErrorBox, PageHeader, ProjectTabs } from '../components';
import { formatDate, useAsync } from '../hooks';
import { useProject } from './ProjectDetailsPage';

export function ApiKeysPage() {
  const { projectId } = useParams();
  const { data: project } = useProject();
  const keys = useAsync(() => api<ApiKey[]>('GET', `/projects/${projectId}/api-keys`), [projectId]);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<ApiKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setCreated(await api<ApiKey>('POST', `/projects/${projectId}/api-keys`, { name }));
      setName('');
      await keys.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function revoke(k: ApiKey) {
    if (!confirm(`Revoke "${k.name}"? Applications using it will immediately get 401 errors.`)) return;
    try {
      await api('DELETE', `/projects/${projectId}/api-keys/${k.id}`);
      await keys.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <PageHeader title={project?.name ?? 'Project'} subtitle="Secret API keys for your servers." />
      <ProjectTabs />
      <div className="alert info">
        API keys are <b>secret</b>. Use them only from your backend. Never put them in browser or mobile code — browsers
        use short-lived user tokens instead (see Integration).
      </div>
      <form className="card form inline" onSubmit={create}>
        <label>
          New key name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} placeholder="production server" />
        </label>
        <button type="submit">Generate key</button>
      </form>
      <ErrorBox error={error || keys.error} />
      {created?.key && (
        <div className="card highlight">
          <h3>Copy your new key now</h3>
          <p className="muted">It is stored only as a hash and will never be shown again.</p>
          <CodeBlock>{created.key}</CodeBlock>
          <button className="secondary" onClick={() => setCreated(null)}>
            I have stored it safely
          </button>
        </div>
      )}
      {keys.data && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Key</th>
                <th>Created</th>
                <th>Last used</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No keys yet.
                  </td>
                </tr>
              )}
              {keys.data.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td>
                    <code>{k.prefix}…</code>
                  </td>
                  <td className="small muted">{formatDate(k.createdAt)}</td>
                  <td className="small muted">{formatDate(k.lastUsedAt)}</td>
                  <td>
                    {k.revokedAt ? (
                      <span className="badge status-revoked">REVOKED {formatDate(k.revokedAt)}</span>
                    ) : (
                      <span className="badge status-delivered">ACTIVE</span>
                    )}
                  </td>
                  <td>
                    {!k.revokedAt && (
                      <button className="danger small" onClick={() => revoke(k)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
