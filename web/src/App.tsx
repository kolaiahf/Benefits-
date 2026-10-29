import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, authToken, setAuthToken, type Group, type User } from "./api";
import { GroupPage } from "./GroupPage";
import { FinchCallback } from "./FinchCallback";

export function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const go = useCallback((next: string) => {
    window.history.pushState({}, "", next);
    setPath(next);
  }, []);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!authToken()) {
      setReady(true);
      return;
    }
    api.me().then((result) => setUser(result.user)).catch(() => setAuthToken(null)).finally(() => setReady(true));
  }, []);

  if (!ready) return <main className="main">Loading Harbor…</main>;
  if (path === "/finch/callback") return <FinchCallback go={go} />;
  if (!user) return <Login onUser={(next) => { setUser(next); go("/groups"); }} />;

  const groupMatch = /^\/groups\/([^/]+)$/.exec(path);
  return (
    <div className="app-shell">
      <aside className="rail">
        <div className="brand">
          <div className="mark">H</div>
          <div>
            <strong>Harbor</strong>
            <span>General agency</span>
          </div>
        </div>
        <nav>
          <a href="/groups" onClick={(event) => { event.preventDefault(); go("/groups"); }}>Groups</a>
          <a href="/docs">API docs</a>
        </nav>
        <div className="quiet">
          <div>{user.name}</div>
          <button className="linkish" onClick={() => { setAuthToken(null); setUser(null); go("/login"); }}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        {groupMatch ? <GroupPage groupId={groupMatch[1]} /> : <Groups go={go} />}
      </main>
    </div>
  );
}

function Login({ onUser }: { onUser: (user: User) => void }) {
  const [email, setEmail] = useState("broker@example.com");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.login(email, password);
      setAuthToken(result.token);
      onUser(result.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="panel login-card" onSubmit={submit}>
        <p className="kicker">Harbor Agency</p>
        <h1>Quote the group. Keep the census.</h1>
        <p className="lede">Small-group medical, dental, and vision for the brokerage. Payroll connects through Finch.</p>
        {error && <div className="error">{error}</div>}
        <label>Email
          <input name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>Password
          <input name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <button className="primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}

function Groups({ go }: { go: (path: string) => void }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState("");
  const [legalName, setLegalName] = useState("Northwind Studio");
  const [state, setState] = useState("CA");
  const [zip, setZip] = useState("92101");
  const [effective, setEffective] = useState("2026-07-01");

  useEffect(() => {
    api.groups().then((result) => setGroups(result.groups)).catch((caught: Error) => setError(caught.message));
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api.createGroup({
        legal_name: legalName,
        state,
        zip,
        effective_date: effective,
        sic: "7336",
      });
      go(`/groups/${result.group.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the group");
    }
  }

  return (
    <div className="stack">
      <div>
        <p className="kicker">Book of business</p>
        <h1>Employer groups</h1>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="split">
        <section className="stack">
          {groups.length === 0 && <div className="panel">No groups yet. Open a case on the right.</div>}
          <div className="cards">
            {groups.map((group) => (
              <a key={group.id} className="panel group-card" href={`/groups/${group.id}`} onClick={(event) => { event.preventDefault(); go(`/groups/${group.id}`); }}>
                <strong>{group.legal_name}</strong>
                <div className="meta">{group.state} {group.zip} · effective {group.effective_date}</div>
              </a>
            ))}
          </div>
        </section>
        <form className="panel stack" onSubmit={create}>
          <h2>New group</h2>
          <label>Legal name
            <input value={legalName} onChange={(event) => setLegalName(event.target.value)} required />
          </label>
          <div className="row">
            <label>State
              <input value={state} onChange={(event) => setState(event.target.value)} maxLength={2} required />
            </label>
            <label>ZIP
              <input value={zip} onChange={(event) => setZip(event.target.value)} required />
            </label>
          </div>
          <label>Effective date
            <input type="date" value={effective} onChange={(event) => setEffective(event.target.value)} required />
          </label>
          <button className="primary" type="submit">Create group</button>
        </form>
      </div>
    </div>
  );
}
