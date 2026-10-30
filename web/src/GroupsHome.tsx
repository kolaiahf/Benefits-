"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, type Group } from "./api";

export function GroupsHome({ go }: { go: (path: string) => void }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState("");
  const [legalName, setLegalName] = useState("");
  const [state, setState] = useState("CA");
  const [zip, setZip] = useState("");
  const [effective, setEffective] = useState("2026-10-01");

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
            <input value={legalName} placeholder="Northwind Studio" onChange={(event) => setLegalName(event.target.value)} required />
          </label>
          <div className="row">
            <label>State
              <input value={state} onChange={(event) => setState(event.target.value.toUpperCase())} maxLength={2} required />
            </label>
            <label>ZIP
              <input value={zip} placeholder="92101" onChange={(event) => setZip(event.target.value)} required />
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
