"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, api, bearerToken, setPasswordToken, type User } from "../../web/src/api";
import { formatDollars, vsTodayLabel } from "../../src/quoting/format";
import type { QuoteDocument, RatedPlanQuote } from "../../src/quoting/types";

export function QuoteApp({ productName }: { productName: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [quote, setQuote] = useState<QuoteDocument | null>(null);
  const [saved, setSaved] = useState<Array<{ id: string; employerName: string; createdAt: string }>>([]);

  useEffect(() => {
    api.me().then((result) => setUser(result.user)).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch("/v1/small-group/quotes", { headers: authHeaders() })
      .then((response) => response.ok ? response.json() : { quotes: [] })
      .then((body: { quotes: Array<{ id: string; employerName: string; createdAt: string }> }) => setSaved(body.quotes))
      .catch(() => setSaved([]));
  }, [user, quote?.id]);

  if (!ready) return <p className="lab" style={{ padding: 48 }}>Loading…</p>;
  if (!user) return <SignIn productName={productName} onUser={setUser} />;
  if (!quote) {
    return (
      <Composer
        productName={productName}
        user={user}
        saved={saved}
        onQuote={setQuote}
        onSignOut={() => { setPasswordToken(null); setUser(null); }}
      />
    );
  }
  return <QuoteScreen productName={productName} user={user} quote={quote} onQuote={setQuote} onBack={() => setQuote(null)} />;
}

function SignIn({ productName, onUser }: { productName: string; onUser: (user: User) => void }) {
  const [email, setEmail] = useState("broker@example.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api.login(email, password);
      setPasswordToken(result.token);
      onUser(result.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed");
    }
  }
  return (
    <div className="signin">
      <div className="brand"><i />{productName}</div>
      <h1 className="serif" style={{ fontSize: 48, margin: "28px 0 8px" }}>Sign in</h1>
      <p className="lab">If this install has no Supabase project, use the local password from the env example.</p>
      <form className="card" onSubmit={submit}>
        <label className="field"><span className="lab">Email</span><input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" /></label>
        <label className="field"><span className="lab">Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
        {error ? <p role="alert">{error}</p> : null}
        <button className="btn gold" type="submit">Sign in</button>
      </form>
    </div>
  );
}

function Composer({
  productName, user, saved, onQuote, onSignOut,
}: {
  productName: string;
  user: User;
  saved: Array<{ id: string; employerName: string; createdAt: string }>;
  onQuote: (quote: QuoteDocument) => void;
  onSignOut: () => void;
}) {
  const [employerName, setEmployerName] = useState("Northwind Coffee Co.");
  const [zip, setZip] = useState("92101");
  const [effective, setEffective] = useState("2026-08-01");
  const [employeePercent, setEmployeePercent] = useState(80);
  const [dependentPercent, setDependentPercent] = useState(50);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
    setIssues([]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setIssues([]);
    try {
      const response = await fetch("/v1/small-group/quotes", {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          employer_name: employerName,
          employer_zip: zip,
          effective_date: effective,
          census_csv: csv,
          employer_employee_percent: employeePercent,
          employer_dependent_percent: dependentPercent,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        const details = body.error?.details;
        setIssues(Array.isArray(details) ? details : [body.error?.message ?? "Could not rate this census"]);
        return;
      }
      onQuote(body.quote as QuoteDocument);
    } catch {
      setIssues(["Could not reach the quoting service."]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="composer">
      <div className="navline">
        <div className="brand"><i />{productName}</div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {user.role === "admin" ? <a href="/quotes/team">Team</a> : null}
          <button className="btn ghost" type="button" onClick={onSignOut} style={{ height: 36 }}>Sign out</button>
        </div>
      </div>
      <p className="lab">{user.name}</p>
      <h1 className="serif" style={{ fontSize: 48, margin: "8px 0" }}>New quote</h1>
      <p>Upload a census. Premiums use the employer ZIP for one of 19 California rating areas, then each person’s age.</p>
      <form className="card" onSubmit={submit}>
        <label className="field"><span className="lab">Employer</span><input value={employerName} onChange={(event) => setEmployerName(event.target.value)} required /></label>
        <div className="row2">
          <label className="field"><span className="lab">Employer ZIP</span><input value={zip} onChange={(event) => setZip(event.target.value)} inputMode="numeric" required /></label>
          <label className="field"><span className="lab">Effective date</span><input type="date" value={effective} onChange={(event) => setEffective(event.target.value)} required /></label>
        </div>
        <div className="row2">
          <label className="field"><span className="lab">Employer pays % of employee premium</span><input type="number" min={0} max={100} value={employeePercent} onChange={(event) => setEmployeePercent(Number(event.target.value))} /></label>
          <label className="field"><span className="lab">Employer pays % of dependent premium</span><input type="number" min={0} max={100} value={dependentPercent} onChange={(event) => setDependentPercent(Number(event.target.value))} /></label>
        </div>
        <label className="field">
          <span className="lab">Census CSV</span>
          <input type="file" accept=".csv,text/csv" onChange={(event) => void onFile(event.target.files?.[0])} />
        </label>
        <p className="lab">{fileName || "No file yet."} Columns: employee_name, date_of_birth, zip, spouse_date_of_birth, child_1_date_of_birth …</p>
        <p><a href="/northwind-coffee.csv">Download the Northwind Coffee example (42 employees)</a></p>
        {issues.length ? <ul className="errors" role="alert">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
        <button className="btn gold" type="submit" disabled={busy || !csv}>{busy ? "Rating…" : "See renewal options"}</button>
      </form>
      <p style={{ marginTop: 18 }}><a href="/connect">Employer census link</a> is a later step. Payroll connect is not turned on.</p>
      {saved.length ? (
        <div style={{ marginTop: 28 }}>
          <p className="lab">Earlier quotes</p>
          {saved.map((item) => (
            <button key={item.id} className="plan" type="button" onClick={() => void openQuote(item.id, onQuote, setIssues)}>
              <b>{item.employerName}</b>
              <div className="lab">{item.createdAt.slice(0, 10)}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

async function openQuote(id: string, onQuote: (quote: QuoteDocument) => void, setIssues: (issues: string[]) => void) {
  const response = await fetch(`/v1/small-group/quotes/${id}`, { headers: authHeaders() });
  const body = await response.json();
  if (!response.ok) {
    setIssues([body.error?.message ?? "Could not open that quote"]);
    return;
  }
  onQuote(body.quote as QuoteDocument);
}

function QuoteScreen({
  productName, user, quote, onQuote, onBack,
}: {
  productName: string;
  user: User;
  quote: QuoteDocument;
  onQuote: (quote: QuoteDocument) => void;
  onBack: () => void;
}) {
  const [selectedId, setSelectedId] = useState(quote.recommendedPlanId);
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [currentId, setCurrentId] = useState(quote.currentPlanId ?? "");
  const [increase, setIncrease] = useState(quote.renewalIncreasePercent ?? 0);
  const selected = quote.plans.find((plan) => plan.planId === selectedId) ?? quote.plans[0];
  const current = quote.currentPlanId ? quote.plans.find((plan) => plan.planId === quote.currentPlanId) ?? null : null;
  const visible = showAllPlans ? quote.plans : quote.plans.slice(0, 4);
  const hidden = Math.max(0, quote.plans.length - visible.length);
  const people = selected ? (showAllPeople ? selected.employees : selected.employees.slice(0, 4)) : [];
  const share = selected && selected.monthlyCents ? Math.round((selected.employerCents / selected.monthlyCents) * 100) : 0;
  const scale = useMemo(() => buildScale(quote, current), [quote, current]);

  async function download() {
    const response = await fetch(`/v1/small-group/quotes/${quote.id}/pdf`, { headers: authHeaders() });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${quote.employerName} proposal.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function saveMarkers(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`/v1/small-group/quotes/${quote.id}`, {
      method: "POST",
      headers: { ...authHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        current_plan_id: currentId || null,
        renewal_increase_percent: currentId ? increase : null,
      }),
    });
    const body = await response.json();
    if (response.ok) onQuote(body.quote as QuoteDocument);
  }

  if (!selected) return null;
  return (
    <>
      <div className="quote-shell">
        <aside className="panel glow">
          <div className="brand"><i />{productName}</div>
          <div style={{ marginTop: 36 }}>
            <div style={{ fontWeight: 600 }}>{quote.employerName}</div>
            <div style={{ color: "var(--ink2)" }}>{quote.employeeCount} employees · Effective {shortDate(quote.effectiveDate)}</div>
            <p className="lab" style={{ marginTop: 36 }}>Total monthly cost</p>
            <p className="hero serif">{formatDollars(selected.monthlyCents)}</p>
            <div className="who"><span className="dot" />{selected.carrierName} {selected.planName}</div>
            <div className="split">
              <div><span className="lab">{quote.employerName.split(" ")[0]} pays</span><b>{formatDollars(selected.employerCents)}</b></div>
              <div style={{ textAlign: "right" }}><span className="lab">Employees pay</span><b>{formatDollars(selected.employeeCents)}</b></div>
            </div>
            <div className="bar"><i style={{ width: `${share}%` }} /></div>
          </div>
          <Scale scale={scale} />
          {quote.renewalMonthlyCents != null ? (
            <p className="save-line"><b>{formatDollars(quote.renewalMonthlyCents - selected.monthlyCents)} a month</b> {quote.renewalMonthlyCents >= selected.monthlyCents ? "less than your renewal." : "more than your renewal."}</p>
          ) : null}
          <p className="lab" style={{ marginTop: 12 }}>Rating area {quote.ratingArea}. Employer pays {quote.contribution.employerEmployeePercent}% of the employee premium and {quote.contribution.employerDependentPercent}% of dependent premium.</p>
          <p className="fn">Example rates, not real quotes</p>
        </aside>
        <section className="quote-main">
          <div className="topbar">
            <div>
              <h1 className="serif">Renewal options</h1>
              <p style={{ color: "var(--ink2)", margin: "4px 0 0" }}>{quote.plans.length} plans for {quote.employerName}, closest to the recommendation first.</p>
            </div>
            <button className="btn gold" type="button" onClick={() => void download()}>Download PDF</button>
          </div>
          <div className="cols lab"><span>Plan</span><span>Deductible</span><span>Out-of-pocket max</span><span>Primary care</span><span style={{ textAlign: "right" }}>Monthly · vs today</span></div>
          {visible.map((plan) => (
            <PlanRow
              key={plan.planId}
              plan={plan}
              open={plan.planId === selected.planId}
              recommended={plan.planId === quote.recommendedPlanId}
              currentCents={current?.monthlyCents ?? null}
              people={plan.planId === selected.planId ? people : []}
              hiddenPeople={plan.planId === selected.planId ? selected.employees.length - people.length : 0}
              onOpen={() => { setSelectedId(plan.planId); setShowAllPeople(false); }}
              onShowPeople={() => setShowAllPeople(true)}
            />
          ))}
          {hidden > 0 ? <button className="more" type="button" onClick={() => setShowAllPlans(true)}>Show {hidden} more plans</button> : null}
          <form onSubmit={saveMarkers} className="card">
            <p className="lab">Today’s plan and the renewal, optional</p>
            <div className="row2">
              <label className="field">
                <span className="lab">Current plan</span>
                <select value={currentId} onChange={(event) => setCurrentId(event.target.value)}>
                  <option value="">Not set</option>
                  {quote.plans.map((plan) => <option key={plan.planId} value={plan.planId}>{plan.carrierName} {plan.planName}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="lab">Renewal increase %</span>
                <input type="number" value={increase} onChange={(event) => setIncrease(Number(event.target.value))} />
              </label>
            </div>
            <button className="btn ghost" type="submit" style={{ height: 40 }}>Update scale</button>
          </form>
          <p style={{ marginTop: 18 }}><button className="more" type="button" onClick={onBack}>New census</button></p>
          <p className="lab">{user.email} · {quote.disclaimer}</p>
        </section>
      </div>
      <div className="dock"><button className="btn gold" type="button" onClick={() => void download()}>Download PDF</button></div>
    </>
  );
}

function PlanRow({
  plan, open, recommended, currentCents, people, hiddenPeople, onOpen, onShowPeople,
}: {
  plan: RatedPlanQuote;
  open: boolean;
  recommended: boolean;
  currentCents: number | null;
  people: RatedPlanQuote["employees"];
  hiddenPeople: number;
  onOpen: () => void;
  onShowPeople: () => void;
}) {
  const vs = vsTodayLabel(plan.monthlyCents, currentCents);
  return (
    <div className={recommended ? "plan rec" : "plan"}>
      <button type="button" className="plan-top" onClick={onOpen} style={{ background: "transparent", border: 0, padding: 0, width: "100%", cursor: "pointer" }}>
        <span>
          <span className="carrier">{plan.carrierName}{recommended ? <span className="gtag">Recommended</span> : null}</span>
          <b>{plan.planName}</b>
          <span className="lab mobile-only">{moneyOr(plan.deductibleCents)} deductible · {plan.primaryCare ?? "primary care not in the rate book"}</span>
        </span>
        <span className="desk">{moneyOr(plan.deductibleCents)}</span>
        <span className="desk">{moneyOr(plan.oopMaxCents)}</span>
        <span className="desk">{plan.primaryCare ?? "—"}</span>
        <span className="price"><b className="serif">{formatDollars(plan.monthlyCents)}</b>{vs ? <span>{vs}</span> : null}</span>
      </button>
      {open ? (
        <div className="expand">
          <div>
            <div className="lab">Benefits</div>
            <Benefit label="Coinsurance" value={plan.coinsurancePercent != null ? `${plan.coinsurancePercent}%` : "—"} />
            <Benefit label="Specialist" value={plan.specialist ?? "—"} />
            <Benefit label="Urgent care" value={plan.urgentCare ?? "—"} />
            <Benefit label="Emergency room" value={plan.emergencyRoom ?? "—"} />
            <Benefit label="Prescriptions" value={plan.prescriptions ?? "—"} />
          </div>
          <div>
            <div className="emp-row lab"><span>Per employee</span><span>Age</span><span>Covers</span><span>Monthly</span></div>
            {people.map((employee) => (
              <div className="emp-row" key={employee.employeeId}>
                <span>{employee.name}</span>
                <span>{employee.ages[0]}</span>
                <span style={{ color: "var(--ink2)" }}>{employee.covers}</span>
                <span style={{ textAlign: "right" }}>{formatDollars(employee.monthlyCents)}</span>
              </div>
            ))}
            {hiddenPeople > 0 ? <button className="more" type="button" onClick={onShowPeople}>All {people.length + hiddenPeople} employees</button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Benefit({ label, value }: { label: string; value: string }) {
  return <div className="benefit"><span style={{ color: "var(--ink2)" }}>{label}</span><b style={{ fontWeight: 500 }}>{value}</b></div>;
}

function Scale({ scale }: { scale: ScaleModel }) {
  return (
    <div className="scale" aria-hidden="true">
      <div className="ln" />
      {scale.dots.map((dot) => <i key={dot.key} className={`mark ${dot.kind}`} style={{ left: `${dot.left}%` }} />)}
      {scale.captions.map((caption) => (
        <span key={caption.key} className={`cap ${caption.place}`} style={caption.place === "end hi" ? undefined : { left: `${caption.left}%` }}>{caption.text}</span>
      ))}
    </div>
  );
}

interface ScaleModel {
  dots: Array<{ key: string; kind: string; left: number }>;
  captions: Array<{ key: string; text: string; left: number; place: string }>;
}

function buildScale(quote: QuoteDocument, current: RatedPlanQuote | null): ScaleModel {
  const amounts = quote.plans.map((plan) => plan.monthlyCents);
  if (current) amounts.push(current.monthlyCents);
  if (quote.renewalMonthlyCents != null) amounts.push(quote.renewalMonthlyCents);
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  const at = (value: number) => high === low ? 50 : ((value - low) / (high - low)) * 100;
  const dots = quote.plans.map((plan) => ({
    key: plan.planId,
    kind: plan.planId === quote.recommendedPlanId ? "rc" : plan.planId === current?.planId ? "cu" : "opt",
    left: at(plan.monthlyCents),
  }));
  if (quote.renewalMonthlyCents != null) dots.push({ key: "renewal", kind: "re", left: at(quote.renewalMonthlyCents) });
  const captions = [
    { key: "lo", text: `Lowest ${formatDollars(low)}`, left: 0, place: "end" },
    { key: "hi", text: `Highest ${formatDollars(high)}`, left: 100, place: "end hi" },
  ];
  const recommended = quote.plans.find((plan) => plan.planId === quote.recommendedPlanId);
  if (recommended) captions.push({ key: "rec", text: "Recommended", left: at(recommended.monthlyCents), place: "top" });
  if (current) captions.push({ key: "cur", text: "Current", left: at(current.monthlyCents), place: "bot" });
  if (quote.renewalMonthlyCents != null) captions.push({ key: "ren", text: "Renewal", left: at(quote.renewalMonthlyCents), place: "bot" });
  return { dots, captions };
}

function moneyOr(cents: number | null): string {
  return cents == null ? "—" : formatDollars(cents);
}

function shortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

function authHeaders(): HeadersInit {
  const token = bearerToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}
