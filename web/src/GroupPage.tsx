"use client";

import { useEffect, useState } from "react";
import { api, type CatalogPlan, type FinchStatus, type Group, type Member, type Quote } from "./api";
import { useBrand } from "./brand-context";
import { usd } from "./format";

export function GroupPage({ groupId, sampleCensus }: { groupId: string; sampleCensus: string }) {
  const [group, setGroup] = useState<Group | null>(null);
  const [tab, setTab] = useState<"census" | "quote" | "payroll">("census");
  const [error, setError] = useState("");

  useEffect(() => {
    api.groups().then((result) => {
      setGroup(result.groups.find((item) => item.id === groupId) ?? null);
    }).catch((caught: Error) => setError(caught.message));
  }, [groupId]);

  if (!group && !error) return <p>Loading group…</p>;
  if (!group) return <div className="error">{error || "Group not found"}</div>;

  return (
    <div className="stack">
      <div>
        <p className="kicker">{group.state} · {group.zip} · effective {group.effective_date}</p>
        <h1>{group.legal_name}</h1>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="tabs" role="tablist">
        {(["census", "quote", "payroll"] as const).map((item) => (
          <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>
            {item === "census" ? "Census" : item === "quote" ? "Quote" : "Payroll"}
          </button>
        ))}
      </div>
      {tab === "census" && <CensusTab groupId={groupId} sampleCensus={sampleCensus} onError={setError} />}
      {tab === "quote" && <QuoteTab groupId={groupId} onError={setError} />}
      {tab === "payroll" && <PayrollTab groupId={groupId} onError={setError} onSynced={() => setTab("census")} />}
    </div>
  );
}

function CensusTab({ groupId, sampleCensus, onError }: { groupId: string; sampleCensus: string; onError: (message: string) => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [notice, setNotice] = useState("");

  async function refresh() {
    const result = await api.census(groupId);
    setMembers(result.members);
  }

  useEffect(() => {
    refresh().catch((caught: Error) => onError(caught.message));
  }, [groupId]);

  async function upload(csv: string) {
    onError("");
    setNotice("");
    try {
      const result = await api.uploadCensus(groupId, csv);
      setMembers(result.members);
      setNotice(`Saved ${result.count} people.`);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Census upload failed");
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <button className="primary" type="button" onClick={() => upload(sampleCensus)}>Load sample census</button>
        <label className="ghost">Upload CSV
          <input type="file" accept=".csv,text/csv" onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            await upload(await file.text());
          }} />
        </label>
      </div>
      {notice && <div className="ok">{notice}</div>}
      <div className="panel">
        {members.length === 0 ? <p>No census yet. Load the Northwind sample or upload a CSV with subscriber_id, relationship, first_name, last_name, date_of_birth, and zip.</p> : (
          <table>
            <thead>
              <tr><th>Name</th><th>Relationship</th><th>Date of birth</th><th>ZIP</th><th>Salary</th><th>Status</th></tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>{member.first_name} {member.last_name}</td>
                  <td>{member.relationship}</td>
                  <td>{member.date_of_birth}</td>
                  <td>{member.zip}</td>
                  <td>{member.annual_salary_cents ? usd(member.annual_salary_cents) : "—"}</td>
                  <td>{member.waived ? "Waived" : member.tobacco ? "Tobacco" : "Enrolled"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function QuoteTab({ groupId, onError }: { groupId: string; onError: (message: string) => void }) {
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [source, setSource] = useState<"filed" | "sample">("filed");
  const [percent, setPercent] = useState(75);
  const [priority, setPriority] = useState("balanced");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.plans().then((result) => {
      setPlans(result.plans);
      const filed = result.plans.some((plan) => plan.rate_basis === "blue_shield_ca_filed");
      setSource(filed ? "filed" : "sample");
      setSelected(defaultSelection(result.plans, filed ? "filed" : "sample"));
    }).catch((caught: Error) => onError(caught.message));
  }, [groupId]);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function run() {
    setBusy(true);
    onError("");
    try {
      const result = await api.quote(groupId, {
        plan_ids: selected,
        contribution: { mode: "percent_of_premium", employer_percent: percent },
        preferences: { prioritize: priority },
      });
      setQuote(result.quote);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Quote failed");
    } finally {
      setBusy(false);
    }
  }

  const recommended = new Set(quote?.recommendation.selections.map((selection) => selection.plan_id) ?? []);

  return (
    <div className="stack">
      <div className="panel stack">
        <div className="row">
          <label>Rate source
            <select value={source} onChange={(event) => {
              const next = event.target.value === "sample" ? "sample" : "filed";
              setSource(next);
              setSelected(defaultSelection(plans, next));
              setQuote(null);
            }}>
              <option value="filed">Blue Shield of California filed</option>
              <option value="sample">Illustrative sample</option>
            </select>
          </label>
          <label>Employer percent
            <input type="number" min={0} max={100} value={percent} onChange={(event) => setPercent(Number(event.target.value))} />
          </label>
          <label>Recommendation
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="balanced">Balanced</option>
              <option value="cost">Lowest employee cost</option>
              <option value="richness">Richest plan</option>
            </select>
          </label>
          <button className="primary" type="button" onClick={run} disabled={busy || selected.length === 0}>
            {busy ? "Rating…" : "Quote plans"}
          </button>
        </div>
        <div className="check-grid">
          {(source === "filed"
            ? plans.filter((plan) => FILED_DEFAULTS.includes(plan.id))
            : plans.filter((plan) => plan.rate_basis === "illustrative_sample")).map((plan) => (
            <label key={plan.id}>
              <input type="checkbox" checked={selected.includes(plan.id)} onChange={() => toggle(plan.id)} />
              {plan.line} · {plan.name}
            </label>
          ))}
        </div>
      </div>
      {quote && (
        <>
          {quote.filed && (
            <div className="ok">Blue Shield of California, from public filed rates, indicative. Q4 2026 (October 1–December 31). Employer rating region {quote.rating_region ?? "unknown"}.</div>
          )}
          {quote.illustrative && (
            <div className="banner">Illustrative sample rates. These are not a carrier filing.</div>
          )}
          {quote.warnings.map((warning) => <div key={warning.code} className="banner">{warning.message}</div>)}
          <section className="panel stack">
            <p className="kicker">Recommendation · {quote.recommendation.narrative.source}</p>
            <p className="narrative">{quote.recommendation.narrative.text}</p>
            <div className="cards">
              {quote.recommendation.selections.map((selection) => (
                <article key={selection.plan_id}>
                  <p className="kicker">{selection.line}</p>
                  <h3>{selection.name}</h3>
                  <div className="meta">{usd(selection.monthly_premium_cents)} / month · employer {usd(selection.employer_monthly_cents)}</div>
                  <ul className="reasons">{selection.reasons.slice(0, 2).map((reason) => <li key={reason}>{reason}</li>)}</ul>
                </article>
              ))}
            </div>
          </section>
          <div className="panel">
            <table className="nums">
              <thead>
                <tr>
                  <th>Plan</th><th>Line</th><th></th>
                  <th>Monthly</th><th>Employer</th><th>Employees</th><th>PEPM</th>
                </tr>
              </thead>
              <tbody>
                {quote.plans.map((plan) => (
                  <tr key={plan.plan_id}>
                    <td>{plan.name}<div className="meta">{plan.carrier}</div></td>
                    <td>{plan.line}</td>
                    <td>{recommended.has(plan.plan_id) ? <span className="pill">Recommended</span> : ""}</td>
                    <td>{usd(plan.monthly_premium_cents)}</td>
                    <td>{usd(plan.employer_monthly_cents)}</td>
                    <td>{usd(plan.employee_monthly_cents)}</td>
                    <td>{usd(plan.pepm_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Households quote={quote} />
          <p className="meta">
            <a href={`/v1/quotes/${quote.id}?format=csv`}>Download comparison CSV</a>
            {" · "}{quote.enrolled_employees} enrolled of {quote.eligible_employees} eligible
          </p>
        </>
      )}
    </div>
  );
}

const FILED_DEFAULTS = [
  "bsc-2026q4-platinum-full-ppo-250-10-offex",
  "bsc-2026q4-gold-full-ppo-1000-30-offex",
  "bsc-2026q4-silver-full-ppo-2100-75-offex",
  "bsc-2026q4-bronze-full-ppo-6500-70-offex",
  "bsc-2026q4-platinum-trio-hmo-0-20-offex",
  "bsc-2026q4-d714",
  "bsc-2026q4-v517",
];

function defaultSelection(plans: CatalogPlan[], source: "filed" | "sample"): string[] {
  const pool = plans.filter((plan) => source === "filed" ? plan.rate_basis === "blue_shield_ca_filed" : plan.rate_basis === "illustrative_sample");
  if (source === "sample") return pool.map((plan) => plan.id);
  const preferred = pool.filter((plan) => FILED_DEFAULTS.includes(plan.id)).map((plan) => plan.id);
  return preferred.length ? preferred : pool.slice(0, 8).map((plan) => plan.id);
}

function Households({ quote }: { quote: Quote }) {
  const medical = quote.plans.find((plan) => plan.plan_id === quote.recommendation.selections.find((selection) => selection.line === "medical")?.plan_id);
  if (!medical) return null;
  return (
    <section className="panel">
      <h2>Medical census detail</h2>
      <p className="meta">{medical.name}. Children beyond the three oldest under 21 are capped at $0.</p>
      <table>
        <thead><tr><th>Person</th><th>Relationship</th><th>Age</th><th>Monthly</th></tr></thead>
        <tbody>
          {medical.households.flatMap((household) => household.members.map((member) => (
            <tr key={`${household.name}-${member.name}`}>
              <td>{member.name}</td>
              <td>{member.relationship}</td>
              <td>{member.age}</td>
              <td>{member.capped ? "Capped" : usd(member.monthly_cents)}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </section>
  );
}

function PayrollTab({ groupId, onError, onSynced }: { groupId: string; onError: (message: string) => void; onSynced: () => void }) {
  const brand = useBrand();
  const [status, setStatus] = useState<FinchStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.finch(groupId).then(setStatus).catch((caught: Error) => onError(caught.message));
  }, [groupId]);

  async function connect() {
    setBusy(true);
    onError("");
    try {
      sessionStorage.setItem("finch_group", groupId);
      const session = await api.finchSession(groupId);
      window.location.href = session.connect_url;
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Finch is not available");
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    onError("");
    try {
      await api.finchSync(groupId);
      onSynced();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel stack">
      <h2>Payroll and current benefits</h2>
      <p className="lede">Finch reads the employer directory, dates of birth, income, and benefit elections. {brand.productName} uses that census for the next quote. Medical rates still do not vary by salary.</p>
      {!status?.configured && (
        <div className="banner">Finch is not configured on this server. Set FINCH_CLIENT_ID, FINCH_CLIENT_SECRET, and FINCH_REDIRECT_URI. Census upload still quotes without payroll.</div>
      )}
      {status?.connected && <div className="ok">Connected{status.provider_id ? ` to ${status.provider_id}` : ""}. {status.last_synced_at ? `Last sync ${status.last_synced_at}` : "Not synced yet."}</div>}
      <div className="row">
        <button className="primary" type="button" onClick={connect} disabled={busy || !status?.configured}>Connect payroll</button>
        <button className="ghost" type="button" onClick={sync} disabled={busy || !status?.connected}>Sync census</button>
      </div>
      {status?.benefits?.benefits && status.benefits.benefits.length > 0 && (
        <table>
          <thead><tr><th>Current plan</th><th>Line</th><th>Enrolled</th><th>Employee</th><th>Employer</th></tr></thead>
          <tbody>
            {status.benefits.benefits.map((benefit) => (
              <tr key={benefit.name}>
                <td>{benefit.name}</td>
                <td>{benefit.line}</td>
                <td>{benefit.enrolled}</td>
                <td>{benefit.employee_contribution_cents === null ? "—" : usd(benefit.employee_contribution_cents)}</td>
                <td>{benefit.employer_contribution_cents === null ? "—" : usd(benefit.employer_contribution_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
