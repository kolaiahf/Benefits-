"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, bearerToken, setPasswordToken, type User } from "../../../web/src/api";

interface Broker { id: string; email: string; name: string; role: string }

export default function TeamPage() {
  const [user, setUser] = useState<User | null>(null);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.me().then((result) => setUser(result.user)).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch("/v1/small-group/brokers", { headers: authHeaders() })
      .then((response) => response.json())
      .then((body: { brokers?: Broker[]; error?: { message: string } }) => {
        if (body.brokers) setBrokers(body.brokers);
        else setMessage(body.error?.message ?? "");
      })
      .catch(() => setMessage("Could not load the team."));
  }, [user]);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/v1/small-group/brokers", {
      method: "POST",
      headers: { ...authHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ email, name }),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error?.message ?? "Could not add that broker");
      return;
    }
    setBrokers((current) => [...current, body.broker]);
    setMessage(`Temporary password for ${body.broker.email}: ${body.temporary_password}. It is shown once and is not emailed.`);
    setEmail("");
    setName("");
  }

  async function remove(id: string) {
    const response = await fetch(`/v1/small-group/brokers/${id}`, { method: "DELETE", headers: authHeaders() });
    if (response.ok) setBrokers((current) => current.filter((broker) => broker.id !== id));
  }

  if (!user) {
    return (
      <div className="signin">
        <a href="/quotes">Back to quotes</a>
        <p>Sign in from the quote screen first.</p>
        <button className="btn ghost" type="button" onClick={() => { setPasswordToken(null); window.location.href = "/quotes"; }}>Go to sign in</button>
      </div>
    );
  }

  return (
    <div className="composer">
      <div className="navline">
        <a className="brand" href="/quotes"><i />Team</a>
      </div>
      <h1 className="serif" style={{ fontSize: 40 }}>Brokers</h1>
      <p>People here can see this agency’s quotes. Removing someone only takes away that access.</p>
      <ul className="card">
        {brokers.map((broker) => (
          <li key={broker.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
            <span><b>{broker.name}</b> · {broker.email} · {broker.role}</span>
            {broker.id !== user.id ? <button className="btn ghost" type="button" style={{ height: 36 }} onClick={() => void remove(broker.id)}>Remove</button> : null}
          </li>
        ))}
      </ul>
      {user.role === "admin" ? (
        <form className="card" onSubmit={invite}>
          <label className="field"><span className="lab">Name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label className="field"><span className="lab">Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <button className="btn gold" type="submit">Add broker</button>
        </form>
      ) : <p>An agency admin adds brokers.</p>}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}

function authHeaders(): HeadersInit {
  const token = bearerToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}
