import { ReactNode } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { NotificationType, Paginated } from './api';
import { useAuth } from './auth';

export function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">◉</span> NaaS
        </div>
        <nav>
          <NavLink to="/" end>
            Overview
          </NavLink>
          <NavLink to="/projects">Projects</NavLink>
        </nav>
        <div className="sidebar-foot">
          <div className="muted small">{user?.email}</div>
          <button className="link" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

/** Tabs shown on every project page. */
export function ProjectTabs() {
  const { projectId } = useParams();
  const base = `/projects/${projectId}`;
  return (
    <nav className="tabs">
      <NavLink to={base} end>
        Overview
      </NavLink>
      <NavLink to={`${base}/notifications`}>Notifications</NavLink>
      <NavLink to={`${base}/send`}>Send test</NavLink>
      <NavLink to={`${base}/api-keys`}>API keys</NavLink>
      <NavLink to={`${base}/integration`}>Integration</NavLink>
    </nav>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  );
}

export function TypeBadge({ type }: { type: NotificationType }) {
  return <span className={`badge type-${type.toLowerCase()}`}>{type}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge status-${status.toLowerCase()}`}>{status}</span>;
}

export function ErrorBox({ error }: { error: string | null }) {
  return error ? <div className="alert error">{error}</div> : null;
}

export function Pagination({ meta, onPage }: { meta: Paginated<unknown>['meta']; onPage: (p: number) => void }) {
  if (meta.totalPages <= 1) return <div className="muted small pager">{meta.total} total</div>;
  return (
    <div className="pager">
      <button className="secondary" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
        ← Prev
      </button>
      <span className="muted small">
        Page {meta.page} of {meta.totalPages} · {meta.total} total
      </span>
      <button className="secondary" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>
        Next →
      </button>
    </div>
  );
}

export function CodeBlock({ children }: { children: string }) {
  return (
    <div className="code">
      <button className="link copy" onClick={() => navigator.clipboard?.writeText(children)}>
        Copy
      </button>
      <pre>{children}</pre>
    </div>
  );
}
