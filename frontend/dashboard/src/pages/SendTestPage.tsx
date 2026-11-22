import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, NotificationPriority, NotificationType, PRIORITIES, TYPES } from '../api';
import { ErrorBox, PageHeader, ProjectTabs } from '../components';
import { useProject } from './ProjectDetailsPage';

type Mode = 'user' | 'users' | 'broadcast';

interface SendResult {
  id: string;
  status: string;
  target: string;
  recipientCount: number;
}

export function SendTestPage() {
  const { projectId } = useParams();
  const { data: project } = useProject();
  const [mode, setMode] = useState<Mode>('user');
  const [recipients, setRecipients] = useState('');
  const [title, setTitle] = useState('Test notification');
  const [message, setMessage] = useState('Hello from the Notification Service dashboard!');
  const [type, setType] = useState<NotificationType>('INFO');
  const [priority, setPriority] = useState<NotificationPriority>('NORMAL');
  const [metadata, setMetadata] = useState('');
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    let meta: Record<string, unknown> | undefined;
    if (metadata.trim()) {
      try {
        meta = JSON.parse(metadata);
      } catch {
        return setError('Metadata must be valid JSON');
      }
    }
    const ids = recipients.split(/[\s,]+/).filter(Boolean);
    const body = {
      title,
      message,
      type,
      priority,
      ...(meta && { metadata: meta }),
      ...(mode === 'user' && { userId: ids[0] }),
      ...(mode === 'users' && { userIds: ids }),
      ...(mode === 'broadcast' && { broadcast: true }),
    };
    setBusy(true);
    try {
      setResult(await api<SendResult>('POST', `/projects/${projectId}/notifications`, body));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={project?.name ?? 'Project'} subtitle="Send a test notification through the real delivery pipeline." />
      <ProjectTabs />
      <form className="card form" onSubmit={send}>
        <fieldset className="segmented">
          {(['user', 'users', 'broadcast'] as Mode[]).map((m) => (
            <label key={m} className={mode === m ? 'active' : ''}>
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
              {m === 'user' ? 'One user' : m === 'users' ? 'Several users' : 'Broadcast'}
            </label>
          ))}
        </fieldset>
        {mode !== 'broadcast' ? (
          <label>
            {mode === 'user' ? 'Recipient user id' : 'Recipient user ids (comma or space separated)'}
            <input value={recipients} onChange={(e) => setRecipients(e.target.value)} required placeholder={mode === 'user' ? 'user-123' : 'user-1, user-2'} />
          </label>
        ) : (
          <p className="muted small">Sent to every known end user of this project (users who received a notification or a user token before).</p>
        )}
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
        </label>
        <label>
          Message
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} required maxLength={5000} rows={3} />
        </label>
        <div className="row">
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as NotificationType)}>
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value as NotificationPriority)}>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Metadata <span className="muted small">(optional JSON object)</span>
          <textarea value={metadata} onChange={(e) => setMetadata(e.target.value)} rows={2} placeholder='{"url": "/orders/42"}' />
        </label>
        <ErrorBox error={error} />
        <div>
          <button type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send notification'}
          </button>
        </div>
      </form>
      {result && (
        <div className="alert success">
          {result.status}: stored for {result.recipientCount} recipient(s).{' '}
          <Link to={`/projects/${projectId}/notifications/${result.id}`}>View delivery status →</Link>
        </div>
      )}
    </>
  );
}
