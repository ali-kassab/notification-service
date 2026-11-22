import { useState } from 'react';
import { Inbox } from './Inbox';

// The NaaS base URL is public information; the secret API key lives only in server/demo-server.mjs.
export const NAAS_BASE_URL = import.meta.env.VITE_NAAS_BASE_URL ?? 'http://localhost:3000';
const STORAGE_KEY = 'naas-demo-user';

export function App() {
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: name.trim() }),
    });
    if (!res.ok) return setError((await res.json()).message ?? 'Login failed');
    localStorage.setItem(STORAGE_KEY, name.trim());
    setUserId(name.trim());
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setUserId(null);
  }

  if (!userId) {
    return (
      <main className="card narrow">
        <h1>Acme Shop</h1>
        <p className="muted">
          A demo app that uses the Notification Service. Sign in as any user id (e.g. <code>alice</code>).
        </p>
        <form onSubmit={login} className="row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="user id" required />
          <button type="submit">Sign in</button>
        </form>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  return <Inbox userId={userId} onLogout={logout} />;
}
