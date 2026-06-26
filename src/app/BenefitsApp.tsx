"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect, useCallback } from "react";
import { signOut } from "next-auth/react";
import type { Bootstrap } from "@/lib/bootstrap";

// ── BRAND ────────────────────────────────────────────────────────────────────
const SERIF = "Georgia, 'Times New Roman', serif";
const SH = "0 1px 2px rgba(0,15,71,.05), 0 14px 30px -16px rgba(0,15,71,.22)";
const C = {
  paper: "#F7F3EE", surface: "#FFFFFF",
  ink: "#000F47", ink2: "#3D3C37", grey: "#7B7974", greyLt: "#B9B6B1",
  line: "#E8E2D8", faint: "#F0EBE2",
  sky: "#CEECFF", blue: "#82BAFF", action: "#0B4BFF", gold: "#FFBF00", goldDeep: "#CB7E03",
  accent: "#000F47", accentSoft: "#82BAFF",
};
// Crisp inline-SVG "M" mark (white) — renders sharp on the navy brand everywhere.
const M_WHITE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M10 84V16h16l24 42 24-42h16v68H70V44L52 76h-4L30 44v40z' fill='white'/%3E%3C/svg%3E";

// ── DATA (hydrated from the server per render) ───────────────────────────────
let HOUSEHOLD: any[] = [], FAMILY: any = { ded: {}, oop: {} }, PLAN: any = {},
  PKG: any = {}, GROUPS: any[] = [], CLAIMS: any[] = [], HSA: any = {}, DCFSA: any = {},
  DOCS: any[] = [], COPAYS: any[] = [], BENEFITS: any[] = [], PRIOR_AUTH: any[] = [],
  COST_PROCEDURES: any[] = [], CARE_CATS: any[] = [], PROVIDERS: any = {};
function hydrate(d: Bootstrap) {
  HOUSEHOLD = d.HOUSEHOLD; FAMILY = d.FAMILY; PLAN = d.PLAN; PKG = d.PKG; GROUPS = d.GROUPS;
  CLAIMS = d.CLAIMS; HSA = d.HSA; DCFSA = d.DCFSA; DOCS = d.DOCS; COPAYS = d.COPAYS;
  BENEFITS = d.BENEFITS; PRIOR_AUTH = d.PRIOR_AUTH; COST_PROCEDURES = d.COST_PROCEDURES;
  CARE_CATS = d.CARE_CATS; PROVIDERS = d.PROVIDERS;
}
const byId = (id: string) => HOUSEHOLD.find((m) => m.id === id);
const PRESET_Q = [
  "What does my deductible mean?", "How does coinsurance work?", "Is therapy covered?",
  "Do I have dental?", "What's covered preventive?", "I got a bill that looks wrong",
  "Do I have vision coverage?", "How do I use my HSA?", "How do I find a doctor near me?",
];

// ── HOOKS / HELPERS ──────────────────────────────────────────────────────────
function useCountUp(target: number, dur = 950, run = true) {
  const [v, setV] = useState(run ? 0 : target);
  useEffect(() => {
    if (!run) { setV(target); return; }
    let raf: number, start: number | undefined;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min((t - start) / dur, 1);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur, run]);
  return v;
}
const money0 = (n: number) => "$" + Math.round(n).toLocaleString();
const money2 = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── ICONS ────────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 20, color = C.ink, sw = 1.7 }: any) => {
  const p: any = { stroke: color, strokeWidth: sw, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };
  const g: Record<string, any> = {
    home: React.createElement(React.Fragment, null, React.createElement("path", { ...p, d: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }), React.createElement("polyline", { ...p, points: "9 22 9 12 15 12 15 22" })),
    layers: React.createElement(React.Fragment, null, React.createElement("polygon", { ...p, points: "12 2 2 7 12 12 22 7 12 2" }), React.createElement("polyline", { ...p, points: "2 17 12 22 22 17" }), React.createElement("polyline", { ...p, points: "2 12 12 17 22 12" })),
    search: React.createElement(React.Fragment, null, React.createElement("circle", { ...p, cx: "11", cy: "11", r: "7.5" }), React.createElement("path", { ...p, d: "M21 21l-4.3-4.3" })),
    chat: React.createElement("path", { ...p, d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }),
    life: React.createElement(React.Fragment, null, React.createElement("circle", { ...p, cx: "12", cy: "12", r: "10" }), React.createElement("circle", { ...p, cx: "12", cy: "12", r: "4" }), React.createElement("line", { ...p, x1: "4.9", y1: "4.9", x2: "9.2", y2: "9.2" }), React.createElement("line", { ...p, x1: "14.8", y1: "14.8", x2: "19.1", y2: "19.1" }), React.createElement("line", { ...p, x1: "14.8", y1: "9.2", x2: "19.1", y2: "4.9" }), React.createElement("line", { ...p, x1: "4.9", y1: "19.1", x2: "9.2", y2: "14.8" })),
    shield: React.createElement("path", { ...p, d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" }),
    calc: React.createElement(React.Fragment, null, React.createElement("rect", { ...p, x: "4", y: "3", width: "16", height: "18", rx: "2" }), React.createElement("line", { ...p, x1: "8", y1: "8", x2: "16", y2: "8" }), React.createElement("line", { ...p, x1: "8", y1: "12", x2: "16", y2: "12" }), React.createElement("line", { ...p, x1: "8", y1: "16", x2: "12", y2: "16" })),
    file: React.createElement(React.Fragment, null, React.createElement("path", { ...p, d: "M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" }), React.createElement("polyline", { ...p, points: "13 2 13 9 20 9" })),
    receipt: React.createElement(React.Fragment, null, React.createElement("path", { ...p, d: "M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2z" }), React.createElement("line", { ...p, x1: "9", y1: "8", x2: "15", y2: "8" }), React.createElement("line", { ...p, x1: "9", y1: "12", x2: "15", y2: "12" })),
    chevron: React.createElement("polyline", { ...p, points: "9 18 15 12 9 6" }),
    map: React.createElement(React.Fragment, null, React.createElement("path", { ...p, d: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" }), React.createElement("circle", { ...p, cx: "12", cy: "10", r: "2.5" })),
    download: React.createElement(React.Fragment, null, React.createElement("path", { ...p, d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }), React.createElement("polyline", { ...p, points: "7 10 12 15 17 10" }), React.createElement("line", { ...p, x1: "12", y1: "15", x2: "12", y2: "3" })),
    check: React.createElement("polyline", { ...p, points: "20 6 9 17 4 12" }),
    phone: React.createElement("path", { ...p, d: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 0h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 7.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" }),
    globe: React.createElement(React.Fragment, null, React.createElement("circle", { ...p, cx: "12", cy: "12", r: "10" }), React.createElement("line", { ...p, x1: "2", y1: "12", x2: "22", y2: "12" }), React.createElement("path", { ...p, d: "M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" })),
    send: React.createElement(React.Fragment, null, React.createElement("line", { ...p, x1: "22", y1: "2", x2: "11", y2: "13" }), React.createElement("polygon", { ...p, points: "22 2 15 22 11 13 2 9 22 2" })),
  };
  return React.createElement("svg", { viewBox: "0 0 24 24", width: size, height: size, style: { display: "block" } }, g[name]);
};

// ── PRIMITIVES ────────────────────────────────────────────────────────────────
const Eyebrow = ({ children, right }: any) =>
  React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
    React.createElement("div", { style: { fontSize: 10.5, fontWeight: 700, color: C.grey, textTransform: "uppercase", letterSpacing: ".14em" } }, children), right);
const Card = ({ children, style = {} }: any) => React.createElement("div", { style: { background: C.surface, borderRadius: 16, border: `1px solid ${C.line}`, boxShadow: SH, ...style } }, children);
const Notice = ({ children }: any) => React.createElement("div", { style: { marginBottom: 16, padding: "14px 16px", background: C.sky, borderRadius: 14 } }, React.createElement("div", { style: { fontSize: 12.5, color: C.ink, lineHeight: 1.55 } }, children));
function Row({ left, leftSub, right, rightSub, rightColor = C.ink, last, onClick, chevron }: any) {
  return React.createElement("div", { onClick, className: onClick ? "press" : "", style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: last ? "none" : `1px solid ${C.line}`, cursor: onClick ? "pointer" : "default" } },
    React.createElement("div", { style: { flex: 1, paddingRight: 10 } },
      React.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: C.ink } }, left),
      leftSub && React.createElement("div", { style: { fontSize: 11.5, color: C.grey, marginTop: 2 } }, leftSub)),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
      React.createElement("div", { style: { textAlign: "right" } },
        right && React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: rightColor } }, right),
        rightSub && React.createElement("div", { style: { fontSize: 11, color: C.grey, marginTop: 1 } }, rightSub)),
      chevron && React.createElement(Icon, { name: "chevron", size: 16, color: C.greyLt, sw: 2 })));
}
function Status({ kind }: any) {
  const m: any = { full: { l: "Covered", d: C.ink, t: C.ink, f: true }, partial: { l: "Partial", d: C.grey, t: C.ink2, f: false }, none: { l: "Not enrolled", d: C.greyLt, t: C.grey, f: false }, enrolled: { l: "Enrolled", d: C.ink, t: C.ink, f: true } };
  const s = m[kind] || m.none;
  return React.createElement("div", { style: { display: "inline-flex", alignItems: "center", gap: 6 } },
    React.createElement("span", { style: { width: 7, height: 7, borderRadius: "50%", background: s.f ? s.d : "transparent", border: `1.5px solid ${s.d}`, flexShrink: 0 } }),
    React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: s.t, whiteSpace: "nowrap" } }, s.l));
}
function Arc({ used, total, fill, label, size = 118 }: any) {
  const v = useCountUp(used, 1000);
  const r = (size - 14) / 2, circ = 2 * Math.PI * r, dash = circ * Math.min(v / total, 1);
  const met = used >= total;
  return React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center" } },
    React.createElement("div", { style: { position: "relative", width: size, height: size } },
      React.createElement("svg", { width: size, height: size, style: { transform: "rotate(-90deg)" } },
        React.createElement("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: C.faint, strokeWidth: 8 }),
        React.createElement("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: fill, strokeWidth: 8, strokeDasharray: `${dash} ${circ}`, strokeLinecap: "round" })),
      React.createElement("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" } },
        React.createElement("div", { style: { fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: "-.02em", lineHeight: 1 } }, money0(v)),
        React.createElement("div", { style: { fontSize: 10, color: met ? C.goldDeep : C.grey, marginTop: 4, fontWeight: met ? 700 : 400 } }, met ? "met" : `of ${money0(total)}`))),
    React.createElement("div", { style: { fontSize: 11.5, fontWeight: 700, color: C.ink2, marginTop: 8 } }, label));
}
function MiniBar({ label, used, total, fill }: any) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(Math.min((used / total) * 100, 100)), 60); return () => clearTimeout(t); }, [used, total]);
  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 5 } },
      React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: C.ink2 } }, label),
      React.createElement("span", { style: { fontSize: 12, color: C.grey } }, React.createElement("strong", { style: { color: C.ink } }, "$", used.toLocaleString()), " / $", total.toLocaleString())),
    React.createElement("div", { style: { height: 6, background: C.faint, borderRadius: 3 } },
      React.createElement("div", { style: { height: "100%", width: `${w}%`, background: fill, borderRadius: 3, transition: "width 1s cubic-bezier(.4,0,.2,1)" } })));
}

// ── INSURANCE CARDS ─────────────────────────────────────────────────────────
const THEMES: any = {
  medical: { bg: "linear-gradient(155deg,#000F47 0%,#0A1E63 100%)", fg: "#fff", sub: "rgba(255,255,255,.55)", hair: "rgba(255,255,255,.13)", carrier: "Blue Shield", kind: "Medical · PPO Gold", badge: true, metaType: "medical", strip: [["PCP", "$25"], ["SPEC", "$50"], ["ER", "$300"], ["RX", "$10"]], back: [["Member Services", "1-800-393-6130"], ["24/7 Nurse Line", "1-877-304-0504"], ["Mental Health", "care.lyrahealth.com"]], note: "Claims: Blue Shield of CA, PO Box 272540, Chico, CA 95927" },
  pharmacy: { bg: "#CEECFF", fg: "#000F47", sub: "rgba(0,15,71,.5)", hair: "rgba(0,15,71,.15)", carrier: "Blue Shield", kind: "Pharmacy · Rx", badge: false, metaType: "rx", strip: [["GENERIC", "$10"], ["BRAND", "$45"], ["MAIL 90d", "$20"]], back: [["Pharmacy Help", "1-888-792-7473"], ["Mail Order", "1-866-346-7200"]], note: "Show at any in-network pharmacy. Copays apply after deductible where relevant." },
  dental: { bg: "linear-gradient(155deg,#20242E 0%,#2E3340 100%)", fg: "#fff", sub: "rgba(255,255,255,.5)", hair: "rgba(255,255,255,.13)", carrier: "Delta Dental", kind: "Dental · PPO", badge: false, metaType: "dental", strip: [["PREV", "100%"], ["BASIC", "80%"], ["MAJOR", "50%"], ["MAX", "$1.5k"]], back: [["Customer Service", "1-800-765-6003"], ["Find a dentist", "deltadentalins.com"]], note: "Two cleanings & exams a year covered at 100%." },
  vision: { bg: "#FFF3DA", fg: "#3A3320", sub: "rgba(58,51,32,.55)", hair: "rgba(58,51,32,.18)", carrier: "VSP", kind: "Vision · Choice", badge: false, metaType: "vision", strip: [["EXAM", "$10"], ["FRAMES", "$150"], ["LENSES", "✓"], ["EVERY", "12mo"]], back: [["Customer Service", "1-800-877-7195"], ["Find an eye doctor", "vsp.com"]], note: "Exam, lenses, and a $150 frame allowance every 12 months." },
};
function cardMeta(metaType: string, member: any) {
  if (metaType === "rx") return [["RxBIN", "600428"], ["RxPCN", "06150000"], ["RxGRP", "BSCRX01"]];
  if (metaType === "vision") return [["Member ID", member.memberId]];
  return [["Member ID", member.memberId], ["Group", PLAN.group]];
}
function InsuranceCard({ member, flipped, theme: t }: any) {
  const meta = cardMeta(t.metaType, member);
  return React.createElement("div", { style: { perspective: 1400, width: "100%", height: 200 } },
    React.createElement("div", { style: { position: "relative", width: "100%", height: "100%", transition: "transform .6s cubic-bezier(.4,0,.2,1)", transformStyle: "preserve-3d", transform: flipped ? "rotateY(180deg)" : "rotateY(0)", boxShadow: "0 2px 8px rgba(0,15,71,.10), 0 22px 44px -20px rgba(0,15,71,.45)", borderRadius: 18 } },
      React.createElement("div", { style: { position: "absolute", inset: 0, borderRadius: 18, background: t.bg, color: t.fg, padding: "20px 22px", overflow: "hidden", WebkitBackfaceVisibility: "hidden", backfaceVisibility: "hidden" } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 9 } },
            React.createElement("div", { style: { fontSize: 14.5, fontWeight: 800, letterSpacing: "-.01em" } }, t.carrier),
            React.createElement("div", { style: { width: 1, height: 18, background: t.hair } }),
            React.createElement("div", { style: { fontSize: 11, color: t.sub } }, t.kind)),
          t.badge && React.createElement("div", { style: { fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 5, padding: "3px 7px" } }, "ACTIVE")),
        React.createElement("div", { style: { marginTop: 18, fontFamily: SERIF, fontSize: 20, fontWeight: 500 } }, member.name),
        React.createElement("div", { style: { display: "flex", gap: 22, marginTop: 12 } }, meta.map(([k, v]: any) =>
          React.createElement("div", { key: k },
            React.createElement("div", { style: { fontSize: 8.5, color: t.sub, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" } }, k),
            React.createElement("div", { style: { fontSize: 12, fontWeight: 600, marginTop: 2, fontFamily: "monospace", letterSpacing: ".02em" } }, v)))),
        React.createElement("div", { style: { position: "absolute", left: 22, right: 22, bottom: 16, display: "flex", justifyContent: "space-between", paddingTop: 11, borderTop: `1px solid ${t.hair}` } }, t.strip.map(([k, v]: any) =>
          React.createElement("div", { key: k, style: { textAlign: "center" } },
            React.createElement("div", { style: { fontSize: 8, color: t.sub, fontWeight: 700, letterSpacing: ".06em" } }, k),
            React.createElement("div", { style: { fontSize: 12.5, fontWeight: 700, marginTop: 2 } }, v))))),
      React.createElement("div", { style: { position: "absolute", inset: 0, borderRadius: 18, background: t.bg, color: t.fg, padding: "18px 22px", transform: "rotateY(180deg)", WebkitBackfaceVisibility: "hidden", backfaceVisibility: "hidden" } },
        React.createElement("div", { style: { fontSize: 9, fontWeight: 700, letterSpacing: ".14em", color: t.sub, textTransform: "uppercase" } }, t.carrier, " · ", t.kind),
        React.createElement("div", { style: { marginTop: 14, display: "flex", flexDirection: "column", gap: 11 } }, t.back.map(([k, v]: any) =>
          React.createElement("div", { key: k, style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
            React.createElement("span", { style: { fontSize: 11.5, color: t.sub } }, k),
            React.createElement("span", { style: { fontSize: 12, fontWeight: 700, fontFamily: "monospace" } }, v)))),
        React.createElement("div", { style: { position: "absolute", left: 22, right: 22, bottom: 16, paddingTop: 10, borderTop: `1px solid ${t.hair}`, fontSize: 9.5, color: t.sub, lineHeight: 1.5 } }, t.note))));
}
function WalletStack({ member }: any) {
  const order = ["medical", "pharmacy", "dental", "vision"];
  const [active, setActive] = useState(0);
  const [flip, setFlip] = useState<any>({});
  const onScroll = useCallback((e: any) => { const k = e.currentTarget.children; if (!k.length) return; const w = k[0].getBoundingClientRect().width + 12; setActive(Math.round(e.currentTarget.scrollLeft / w)); }, []);
  return React.createElement("div", null,
    React.createElement("div", { onScroll, style: { display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", padding: "2px 16px 4px", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } }, order.map((id) =>
      React.createElement("div", { key: id, onClick: () => setFlip((f: any) => ({ ...f, [id]: !f[id] })), style: { flex: "0 0 86%", scrollSnapAlign: "center", cursor: "pointer" } },
        React.createElement(InsuranceCard, { member, flipped: !!flip[id], theme: THEMES[id] })))),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 12 } },
      React.createElement("div", { style: { display: "flex", gap: 6 } }, order.map((_, i) => React.createElement("div", { key: i, style: { width: active === i ? 18 : 6, height: 6, borderRadius: 3, background: active === i ? C.ink : C.line, transition: "all .25s" } }))),
      React.createElement("div", { style: { fontSize: 11.5, color: C.greyLt, fontWeight: 500 } }, "Tap a card to flip · swipe to switch")));
}

// ── HOME ──────────────────────────────────────────────────────────────────────
function Home({ setTab }: any) {
  const [memberId, setMemberId] = useState("self");
  const member = byId(memberId);
  const [toast, setToast] = useState(false);
  const hsaV = useCountUp(HSA.balance, 1100);
  const addToWallet = () => { setToast(true); setTimeout(() => setToast(false), 2400); };
  return React.createElement("div", { style: { paddingBottom: 28 } },
    React.createElement("div", { style: { padding: "0 16px 14px", display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none" } }, HOUSEHOLD.map((m) => {
      const on = m.id === memberId;
      return React.createElement("button", { key: m.id, className: "press", onClick: () => setMemberId(m.id), style: { display: "flex", alignItems: "center", gap: 8, padding: "5px 13px 5px 5px", borderRadius: 22, border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : C.surface, cursor: "pointer", flexShrink: 0, transition: "all .2s", boxShadow: on ? SH : "none" } },
        React.createElement("span", { style: { width: 26, height: 26, borderRadius: "50%", background: on ? "rgba(255,255,255,.18)" : C.faint, color: on ? "#fff" : C.ink2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 800 } }, m.initials),
        React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: on ? "#fff" : C.ink2 } }, m.first));
    })),
    React.createElement(WalletStack, { member }),
    React.createElement("div", { style: { padding: "0 16px", margin: "18px 0 22px" } },
      React.createElement("button", { className: "press", onClick: addToWallet, style: { width: "100%", height: 50, background: "#000", border: "none", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, cursor: "pointer" } },
        React.createElement("svg", { viewBox: "0 0 24 24", width: "19", height: "19" }, React.createElement("path", { fill: "#fff", d: "M14.94 5.19A4.38 4.38 0 0 0 16 2a4.44 4.44 0 0 0-3 1.52 4.17 4.17 0 0 0-1 3.09 3.69 3.69 0 0 0 2.94-1.42zm2.52 7.44a4.51 4.51 0 0 1 2.16-3.81 4.66 4.66 0 0 0-3.66-2c-1.56-.16-3 .91-3.83.91s-2-.89-3.3-.87a4.92 4.92 0 0 0-4.14 2.53C2.93 12.45 4.24 17 6 19.47c.8 1.21 1.8 2.58 3.12 2.53s1.75-.82 3.28-.82 2 .82 3.3.79 2.22-1.24 3.06-2.45a11 11 0 0 0 1.38-2.85 4.41 4.41 0 0 1-2.68-4.04z" })),
        React.createElement("span", { style: { color: "#fff", fontSize: 15.5, fontWeight: 600, letterSpacing: "-.01em" } }, "Add all to Apple Wallet")),
      React.createElement("button", { className: "press", onClick: addToWallet, style: { width: "100%", marginTop: 8, background: "none", border: "none", color: C.grey, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "4px 0" } }, "Add to Google Wallet")),
    React.createElement("div", { style: { padding: "0 16px", marginBottom: 16 } },
      React.createElement(Eyebrow, null, member.first, "'s spending · 2026"),
      React.createElement(Card, { style: { padding: "20px 18px 16px" } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-around" } },
          React.createElement(Arc, { used: member.ded.used, total: member.ded.total, fill: C.accent, label: "Deductible" }),
          React.createElement("div", { style: { width: 1, background: C.line } }),
          React.createElement(Arc, { used: member.oop.used, total: member.oop.total, fill: C.accentSoft, label: "Out-of-Pocket Max" })),
        React.createElement("div", { style: { marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.line}`, display: "flex", flexDirection: "column", gap: 12 } },
          React.createElement("div", { style: { fontSize: 10.5, fontWeight: 700, color: C.grey, textTransform: "uppercase", letterSpacing: ".12em" } }, "Family totals"),
          React.createElement(MiniBar, { label: "Family deductible", used: FAMILY.ded.used, total: FAMILY.ded.total, fill: C.accent }),
          React.createElement(MiniBar, { label: "Family out-of-pocket", used: FAMILY.oop.used, total: FAMILY.oop.total, fill: C.accentSoft })))),
    React.createElement("div", { style: { padding: "0 16px", marginBottom: 16 } },
      React.createElement(Card, { style: { padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 10.5, fontWeight: 700, color: C.grey, textTransform: "uppercase", letterSpacing: ".12em" } }, "HSA Balance"),
          React.createElement("div", { style: { fontFamily: SERIF, fontSize: 30, fontWeight: 400, color: C.ink, letterSpacing: "-.01em", marginTop: 3 } }, money2(hsaV))),
        React.createElement("button", { className: "press", onClick: () => setTab("hsa"), style: { background: C.faint, border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 12.5, fontWeight: 700, color: C.ink, cursor: "pointer" } }, "Manage"))),
    React.createElement("div", { style: { padding: "0 16px", marginBottom: 16 } },
      React.createElement(Eyebrow, null, "Quick access"),
      React.createElement(Card, null, [{ label: "Claims & EOBs", icon: "receipt", tab: "claims" }, { label: "Cost estimator", icon: "calc", tab: "cost" }, { label: "Documents", icon: "file", tab: "docs" }].map((m, i, a) =>
        React.createElement("div", { key: m.tab, className: "press", onClick: () => setTab(m.tab), style: { display: "flex", alignItems: "center", gap: 13, padding: "14px 18px", borderBottom: i < a.length - 1 ? `1px solid ${C.line}` : "none", cursor: "pointer" } },
          React.createElement(Icon, { name: m.icon, size: 19, color: C.ink, sw: 1.7 }),
          React.createElement("span", { style: { flex: 1, fontSize: 14, fontWeight: 600, color: C.ink } }, m.label),
          React.createElement(Icon, { name: "chevron", size: 16, color: C.greyLt, sw: 2 }))))),
    React.createElement("div", { style: { padding: "0 16px" } },
      React.createElement(Eyebrow, { right: React.createElement("button", { onClick: () => setTab("claims"), style: { fontSize: 11.5, color: C.action, fontWeight: 700, background: "none", border: "none", cursor: "pointer" } }, "All claims") }, "Recent activity"),
      React.createElement(Card, null, CLAIMS.slice(0, 2).map((cl, i) => React.createElement(Row, { key: i, left: cl.service, leftSub: `${byId(cl.who).first} · ${cl.provider} · ${cl.date}`, right: `$${cl.you}`, rightSub: "your share", last: i === 1 })))),
    toast && React.createElement("div", { style: { position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: C.ink, color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 9, zIndex: 50, boxShadow: "0 8px 24px rgba(0,15,71,.3)", animation: "rise .3s ease" } },
      React.createElement(Icon, { name: "check", size: 16, color: "#fff", sw: 2.5 }), " Added 4 cards to Apple Wallet"));
}

// ── BENEFITS ────────────────────────────────────────────────────────────────
function Benefits({ setTab, openBenefit }: any) {
  return React.createElement("div", { style: { padding: "0 16px 28px" } },
    React.createElement(Notice, null, "Everything your employer offers, in one place. Tap any benefit to see what it covers and how to use it."),
    GROUPS.map((group) => React.createElement("div", { key: group.title, style: { marginBottom: 18 } },
      React.createElement(Eyebrow, null, group.title),
      React.createElement(Card, null, group.items.map((it: any, i: number, a: any[]) => {
        const data = it.id ? PKG[it.id] : null;
        const name = data ? data.name : it.label;
        const sub = data ? data.carrier : it.sub;
        const status = data ? data.status : it.status;
        const onClick = () => { if (it.route === "detail") openBenefit(it.id); else setTab(it.route); };
        return React.createElement("div", { key: name, className: "press", onClick, style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: i < a.length - 1 ? `1px solid ${C.line}` : "none", cursor: "pointer" } },
          React.createElement("div", { style: { flex: 1, paddingRight: 10 } },
            React.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: C.ink } }, name),
            React.createElement("div", { style: { fontSize: 11.5, color: C.grey, marginTop: 2 } }, sub)),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
            React.createElement(Status, { kind: status }),
            React.createElement(Icon, { name: "chevron", size: 16, color: C.greyLt, sw: 2 })));
      })))));
}
function BenefitDetail({ id }: any) {
  const b = PKG[id];
  if (!b) return null;
  return React.createElement("div", { style: { padding: "0 16px 28px" } },
    React.createElement(Card, { style: { padding: "18px 20px", marginBottom: 16 } },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontFamily: SERIF, fontSize: 23, fontWeight: 600, color: C.ink, letterSpacing: "-.01em" } }, b.name),
          React.createElement("div", { style: { fontSize: 12.5, color: C.grey, marginTop: 2 } }, b.carrier)),
        React.createElement(Status, { kind: b.status })),
      React.createElement("div", { style: { marginTop: 12, fontSize: 13.5, color: C.ink2, lineHeight: 1.55 } }, b.summary)),
    React.createElement(Eyebrow, null, "Plan details"),
    React.createElement(Card, { style: { marginBottom: 16 } }, b.rows.map((r: any, i: number) => React.createElement(Row, { key: r[0], left: r[0], right: r[1], rightColor: C.ink2, last: i === b.rows.length - 1 }))),
    (b.call || b.web) && React.createElement("div", { style: { display: "flex", gap: 8 } },
      b.call && React.createElement("a", { href: `tel:${b.call.replace(/[^0-9]/g, "")}`, className: "press", style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px 0", background: C.action, color: "#fff", borderRadius: 11, fontSize: 13, fontWeight: 700, textDecoration: "none" } }, React.createElement(Icon, { name: "phone", size: 15, color: "#fff", sw: 2 }), " Call"),
      b.web && React.createElement("a", { href: `https://${b.web}`, target: "_blank", rel: "noreferrer", className: "press", style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px 0", background: C.surface, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 11, fontSize: 13, fontWeight: 700, textDecoration: "none" } }, React.createElement(Icon, { name: "globe", size: 15, color: C.ink, sw: 2 }), " Website")));
}

// ── COPAYS / COVERAGE ─────────────────────────────────────────────────────────
function Copays() {
  return React.createElement("div", { style: { padding: "0 16px 28px" } },
    React.createElement(Notice, null, "Copays apply on most in-network visits. After your ", React.createElement("strong", null, "$1,500 deductible"), ", coinsurance (20%) applies. At your ", React.createElement("strong", null, "$4,000 out-of-pocket max"), ", covered services are $0."),
    React.createElement(Eyebrow, null, "In-network costs"),
    React.createElement(Card, { style: { marginBottom: 16 } }, COPAYS.map((c, i) => React.createElement(Row, { key: c.label, left: c.label, leftSub: c.note, right: c.cost, last: i === COPAYS.length - 1 }))),
    React.createElement(Eyebrow, null, "Out-of-network"),
    React.createElement(Card, null,
      React.createElement(Row, { left: "Deductible", leftSub: "Separate accumulator", right: "$3,000", rightColor: C.ink2 }),
      React.createElement(Row, { left: "Coinsurance", leftSub: "You pay after OON deductible", right: "40%", rightColor: C.ink2, last: true })));
}
function Coverage() {
  return React.createElement("div", { style: { padding: "0 16px 28px" } },
    React.createElement(Eyebrow, null, "What's included"),
    React.createElement(Card, { style: { marginBottom: 16 } }, BENEFITS.map((b, i) =>
      React.createElement("div", { key: b.label, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 18px", borderBottom: i < BENEFITS.length - 1 ? `1px solid ${C.line}` : "none" } },
        React.createElement("div", { style: { flex: 1, paddingRight: 10 } },
          React.createElement("div", { style: { fontSize: 13.5, fontWeight: 600, color: C.ink } }, b.label),
          React.createElement("div", { style: { fontSize: 11.5, color: C.grey, marginTop: 2 } }, b.detail)),
        React.createElement(Status, { kind: b.status })))),
    React.createElement(Eyebrow, null, "Prior authorization"),
    React.createElement(Card, null, PRIOR_AUTH.map((pa, i) =>
      React.createElement("div", { key: pa.service, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 18px", borderBottom: i < PRIOR_AUTH.length - 1 ? `1px solid ${C.line}` : "none" } },
        React.createElement("div", { style: { flex: 1, paddingRight: 10 } },
          React.createElement("div", { style: { fontSize: 13.5, fontWeight: 600, color: C.ink } }, pa.service),
          React.createElement("div", { style: { fontSize: 11.5, color: C.grey, marginTop: 2 } }, pa.note)),
        React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: pa.required ? C.ink : C.grey } }, pa.required ? "Required" : "Not required")))));
}

// ── FIND CARE ─────────────────────────────────────────────────────────────────
function FindCare() {
  const [cat, setCat] = useState("pcp");
  const cd = CARE_CATS.find((c) => c.id === cat);
  return React.createElement("div", { style: { padding: "0 16px 28px" } },
    React.createElement("div", { style: { display: "flex", overflowX: "auto", gap: 8, marginBottom: 14, paddingBottom: 2, scrollbarWidth: "none" } }, CARE_CATS.map((c) => { const on = cat === c.id; return React.createElement("button", { key: c.id, className: "press", onClick: () => setCat(c.id), style: { padding: "7px 15px", borderRadius: 20, border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : C.surface, color: on ? "#fff" : C.ink2, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", transition: "all .15s" } }, c.label); })),
    React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 14 } },
      React.createElement("div", { style: { flex: 1, background: C.sky, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: C.ink, fontWeight: 600 } }, "Your copay: ", React.createElement("strong", null, cd?.copay), " in-network"),
      React.createElement("div", { style: { background: C.faint, borderRadius: 10, padding: "10px 13px", fontSize: 12, color: C.ink2, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 } }, React.createElement(Icon, { name: "map", size: 13, color: C.ink, sw: 2 }), " San Diego")),
    (PROVIDERS[cat] || []).map((pr: any) => {
      const url = `https://maps.apple.com/?q=${encodeURIComponent(pr.name)}&ll=${pr.lat},${pr.lng}`;
      const stars = Math.round(pr.rating);
      return React.createElement(Card, { key: pr.name, style: { marginBottom: 10, padding: "15px 16px" } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" } },
          React.createElement("div", { style: { flex: 1, paddingRight: 8 } },
            React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: C.ink, lineHeight: 1.3 } }, pr.name),
            React.createElement("div", { style: { fontSize: 11.5, color: C.grey, marginTop: 2 } }, pr.org)),
          React.createElement("div", { style: { background: C.ink, color: "#fff", fontSize: 11.5, fontWeight: 700, borderRadius: 7, padding: "3px 9px", flexShrink: 0 } }, cd?.copay)),
        React.createElement("div", { style: { marginTop: 10, display: "flex", flexDirection: "column", gap: 3 } },
          React.createElement("div", { style: { fontSize: 12, color: C.grey } }, pr.addr),
          React.createElement("div", { style: { fontSize: 12, color: C.grey } }, pr.hours),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 5, marginTop: 2 } },
            React.createElement("span", { style: { color: C.gold, fontSize: 11, letterSpacing: 1 } }, "★".repeat(stars), React.createElement("span", { style: { color: C.greyLt } }, "★".repeat(5 - stars))),
            React.createElement("span", { style: { fontSize: 11, color: C.grey } }, pr.rating.toFixed(1), " · ", pr.reviews.toLocaleString(), " reviews"))),
        React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 12 } },
          React.createElement("a", { href: `tel:${pr.phone}`, className: "press", style: { flex: 1, textAlign: "center", padding: "9px 0", background: C.action, color: "#fff", borderRadius: 9, fontSize: 12.5, fontWeight: 700, textDecoration: "none" } }, "Call"),
          React.createElement("a", { href: url, target: "_blank", rel: "noreferrer", className: "press", style: { flex: 1, textAlign: "center", padding: "9px 0", background: C.surface, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 12.5, fontWeight: 700, textDecoration: "none" } }, "Directions")));
    }));
}

// ── CLAIMS ────────────────────────────────────────────────────────────────────
function Claims() {
  const [filter, setFilter] = useState("all");
  const list = filter === "all" ? CLAIMS : CLAIMS.filter((c) => c.who === filter);
  const total = list.reduce((a, c) => a + c.you, 0);
  const tV = useCountUp(total, 800);
  return React.createElement("div", { style: { padding: "0 16px 28px" } },
    React.createElement("div", { style: { display: "flex", gap: 8, overflowX: "auto", marginBottom: 14, scrollbarWidth: "none" } }, [{ id: "all", label: "All household" }, ...HOUSEHOLD.map((m) => ({ id: m.id, label: m.first }))].map((f) => { const on = filter === f.id; return React.createElement("button", { key: f.id, className: "press", onClick: () => setFilter(f.id), style: { padding: "7px 14px", borderRadius: 20, border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : C.surface, color: on ? "#fff" : C.ink2, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" } }, f.label); })),
    React.createElement(Card, { style: { padding: "16px 18px", marginBottom: 14 } },
      React.createElement("div", { style: { fontSize: 10.5, color: C.grey, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em" } }, "You've paid · 2026"),
      React.createElement("div", { style: { fontFamily: SERIF, fontSize: 31, fontWeight: 600, color: C.ink, letterSpacing: "-.01em", marginTop: 4 } }, money0(tV)),
      React.createElement("div", { style: { fontSize: 12, color: C.grey, marginTop: 2 } }, list.length, " claim", list.length !== 1 ? "s" : "")),
    React.createElement(Eyebrow, null, "Claim history"),
    React.createElement(Card, null, list.map((cl, i) =>
      React.createElement("div", { key: i, style: { padding: "14px 18px", borderBottom: i < list.length - 1 ? `1px solid ${C.line}` : "none" } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" } },
          React.createElement("div", { style: { flex: 1, paddingRight: 8 } },
            React.createElement("div", { style: { fontSize: 13.5, fontWeight: 600, color: C.ink } }, cl.service),
            React.createElement("div", { style: { fontSize: 11.5, color: C.grey, marginTop: 2 } }, byId(cl.who).first, " · ", cl.provider, " · ", cl.date)),
          React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: C.grey } }, React.createElement("span", { style: { width: 7, height: 7, borderRadius: "50%", background: C.ink } }), " Paid")),
        React.createElement("div", { style: { display: "flex", gap: 18, marginTop: 10 } }, [["Billed", `$${cl.billed}`], ["Plan paid", `$${cl.plan}`], ["Your share", `$${cl.you}`]].map(([k, v]) =>
          React.createElement("div", { key: k },
            React.createElement("div", { style: { fontSize: 9.5, color: C.grey, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" } }, k),
            React.createElement("div", { style: { fontSize: 13, fontWeight: 700, color: k === "Your share" ? C.ink : C.ink2, marginTop: 2 } }, v))))))));
}

// ── COST / ACCOUNTS / DOCS ────────────────────────────────────────────────────
function CostEstimator() {
  const [sel, setSel] = useState<string | null>(null);
  const rem = byId("self").ded.total - byId("self").ded.used;
  return React.createElement("div", { style: { padding: "0 16px 28px" } },
    React.createElement(Notice, null, "You have ", React.createElement("strong", null, "$", rem.toLocaleString()), " left before your deductible is met. Estimates assume in-network providers."),
    React.createElement(Eyebrow, null, "Tap a service to estimate"),
    React.createElement(Card, null, COST_PROCEDURES.map((pp, i) =>
      React.createElement("div", { key: pp.label, className: "press", onClick: () => setSel(sel === pp.label ? null : pp.label), style: { padding: "13px 18px", borderBottom: i < COST_PROCEDURES.length - 1 ? `1px solid ${C.line}` : "none", cursor: "pointer", background: sel === pp.label ? C.faint : "transparent" } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
          React.createElement("div", { style: { fontSize: 13.5, fontWeight: 600, color: C.ink } }, pp.label),
          React.createElement("div", { style: { fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: C.ink } }, pp.cost === 0 ? "$0" : `~$${pp.cost}`)),
        sel === pp.label && React.createElement("div", { style: { marginTop: 8, fontSize: 12, color: C.ink2, lineHeight: 1.5, padding: "9px 11px", background: C.sky, borderRadius: 9 } }, pp.note, pp.cost > 0 && pp.cost <= rem && React.createElement("div", { style: { marginTop: 4, color: C.ink, fontWeight: 600 } }, "This applies toward your remaining $", rem, " deductible."))))));
}
function AccountScreen({ headline, sub, progress, rows, eligibleTitle, eligible }: any) {
  const [w, setW] = useState(0);
  useEffect(() => { if (!progress) return; const t = setTimeout(() => setW(progress.pct), 80); return () => clearTimeout(t); }, [progress]);
  return React.createElement("div", { style: { padding: "0 16px 28px" } },
    React.createElement(Card, { style: { padding: "20px 20px 18px", marginBottom: 14 } },
      React.createElement("div", { style: { fontSize: 10.5, fontWeight: 700, color: C.grey, textTransform: "uppercase", letterSpacing: ".12em" } }, sub),
      React.createElement("div", { style: { fontFamily: SERIF, fontSize: 38, fontWeight: 500, color: C.ink, letterSpacing: "-.01em", marginTop: 4, lineHeight: 1 } }, headline),
      progress && React.createElement("div", { style: { marginTop: 14 } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, color: C.grey } }, React.createElement("span", null, progress.label), React.createElement("span", { style: { fontWeight: 700, color: C.ink } }, progress.value)),
        React.createElement("div", { style: { height: 6, background: C.faint, borderRadius: 3 } }, React.createElement("div", { style: { height: "100%", width: `${w}%`, background: C.accent, borderRadius: 3, transition: "width 1s cubic-bezier(.4,0,.2,1)" } })))),
    React.createElement(Eyebrow, null, "Year-to-date"),
    React.createElement(Card, { style: { marginBottom: 14 } }, rows.map((r: any, i: number) => React.createElement(Row, { key: r[0], left: r[0], leftSub: r[2], right: r[1], rightColor: r[3] || C.ink2, last: i === rows.length - 1 }))),
    React.createElement(Eyebrow, null, eligibleTitle),
    React.createElement(Card, null, eligible.map((e: string, i: number, a: any[]) => React.createElement("div", { key: e, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderBottom: i < a.length - 1 ? `1px solid ${C.line}` : "none" } }, React.createElement("span", { style: { fontSize: 13.5, color: C.ink, fontWeight: 500 } }, e), React.createElement(Icon, { name: "check", size: 15, color: C.ink, sw: 2.5 })))));
}
const HSAScreen = () => React.createElement(AccountScreen, { sub: "Available balance", headline: money2(HSA.balance), progress: { label: "2026 contributions", value: `$${HSA.ytdContrib.toLocaleString()} / $${HSA.limit.toLocaleString()}`, pct: Math.round((HSA.ytdContrib / HSA.limit) * 100) }, rows: [["Contributions", `$${HSA.ytdContrib.toLocaleString()}`, "Employee + employer", C.ink], ["Withdrawals", `−$${HSA.ytdSpend.toLocaleString()}`, "Medical expenses paid", C.ink2], ["IRS annual limit", `$${HSA.limit.toLocaleString()}`, "Individual, 2026", C.ink2]], eligibleTitle: "Eligible expenses", eligible: ["Copays & deductibles", "Prescriptions", "Dental & orthodontia", "Vision / eyeglasses", "Mental health visits", "Medical equipment", "LASIK surgery"] });
const FSAScreen = () => React.createElement(AccountScreen, { sub: "Remaining balance", headline: `$${DCFSA.remaining.toLocaleString()}`, progress: { label: "Used of $5,000 election", value: `$${DCFSA.used.toLocaleString()} / $${DCFSA.election.toLocaleString()}`, pct: Math.round((DCFSA.used / DCFSA.election) * 100) }, rows: [["2026 election", `$${DCFSA.election.toLocaleString()}`, "Set during enrollment", C.ink], ["Used", `$${DCFSA.used.toLocaleString()}`, "Reimbursed so far", C.ink2], ["Deadline", "Dec 31, 2026", "Use-it-or-lose-it", C.ink2]], eligibleTitle: "Eligible expenses", eligible: ["Daycare & preschool", "After-school programs", "Summer day camp", "Nanny / au pair", "Before-school care", "Elder day care"] });
function Documents() {
  return React.createElement("div", { style: { padding: "0 16px 28px" } },
    React.createElement(Eyebrow, null, "Your documents"),
    React.createElement(Card, null, DOCS.map((d, i) =>
      React.createElement("div", { key: d.name, className: "press", style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: i < DOCS.length - 1 ? `1px solid ${C.line}` : "none", cursor: "pointer" } },
        React.createElement("div", { style: { display: "flex", gap: 12, alignItems: "center", flex: 1 } },
          React.createElement("div", { style: { width: 36, height: 36, borderRadius: 9, background: C.faint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } }, React.createElement(Icon, { name: "file", size: 16, color: C.ink, sw: 1.8 })),
          React.createElement("div", null,
            React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.3 } }, d.name),
            React.createElement("div", { style: { fontSize: 11, color: C.grey, marginTop: 2 } }, d.type, " · ", d.date))),
        React.createElement(Icon, { name: "download", size: 16, color: C.greyLt, sw: 2 })))));
}

// ── SUPPORT ───────────────────────────────────────────────────────────────────
function Support() {
  const [view, setView] = useState("menu");
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const open = (t: string) => { setTopic(t); setText(""); setView("compose"); };
  const submit = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, body: text }) });
    } catch { /* optimistic — still confirm to the user */ }
    setSending(false);
    setView("sent");
  };
  if (view === "sent") {
    return React.createElement("div", { style: { padding: "40px 16px", textAlign: "center" } },
      React.createElement("div", { style: { width: 56, height: 56, borderRadius: "50%", background: C.sky, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" } }, React.createElement(Icon, { name: "check", size: 26, color: C.ink, sw: 2.5 })),
      React.createElement("div", { style: { fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: C.ink, letterSpacing: "-.01em" } }, "Message sent"),
      React.createElement("div", { style: { fontSize: 13.5, color: C.ink2, marginTop: 8, lineHeight: 1.55, maxWidth: 300, margin: "8px auto 0" } }, "A benefits advocate will review and reply within one business day. You'll get a notification when they respond."),
      React.createElement("button", { className: "press", onClick: () => setView("menu"), style: { marginTop: 24, background: C.action, color: "#fff", border: "none", borderRadius: 11, padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer" } }, "Done"));
  }
  if (view === "compose") {
    return React.createElement("div", { style: { padding: "0 16px 28px" } },
      React.createElement(Card, { style: { padding: "16px 18px", marginBottom: 14 } },
        React.createElement("div", { style: { fontSize: 10.5, fontWeight: 700, color: C.grey, textTransform: "uppercase", letterSpacing: ".12em" } }, "Topic"),
        React.createElement("div", { style: { fontSize: 15, fontWeight: 700, color: C.ink, marginTop: 3 } }, topic)),
      React.createElement(Card, { style: { padding: 4, marginBottom: 14 } },
        React.createElement("textarea", { value: text, onChange: (e: any) => setText(e.target.value), placeholder: "Describe what you need help with. If it's about a bill or claim, include the provider and date.", style: { width: "100%", minHeight: 150, border: "none", outline: "none", resize: "vertical", fontSize: 14, lineHeight: 1.55, color: C.ink, fontFamily: "inherit", padding: 14, background: "transparent" } })),
      React.createElement("div", { style: { display: "flex", gap: 8 } },
        React.createElement("button", { className: "press", onClick: () => setView("menu"), style: { flex: 1, background: C.surface, color: C.ink2, border: `1px solid ${C.line}`, borderRadius: 11, padding: "13px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" } }, "Cancel"),
        React.createElement("button", { className: "press", onClick: submit, disabled: !text.trim() || sending, style: { flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: text.trim() ? C.action : C.line, color: "#fff", border: "none", borderRadius: 11, padding: "13px 0", fontSize: 14, fontWeight: 700, cursor: text.trim() ? "pointer" : "default" } }, React.createElement(Icon, { name: "send", size: 15, color: "#fff", sw: 2 }), sending ? " Sending…" : " Send to my team")));
  }
  return React.createElement("div", { style: { padding: "0 16px 28px" } },
    React.createElement(Card, { style: { padding: "18px 20px", marginBottom: 16 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 13 } },
        React.createElement("div", { style: { width: 44, height: 44, borderRadius: "50%", background: C.ink, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } }, React.createElement(Icon, { name: "life", size: 22, color: "#fff", sw: 2 })),
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: 16, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" } }, "MMA Member Advocacy"),
          React.createElement("div", { style: { fontSize: 12, color: C.grey, marginTop: 2 } }, "Replies within 1 business day"))),
      React.createElement("div", { style: { marginTop: 13, fontSize: 13.5, color: C.ink2, lineHeight: 1.55 } }, "Real people who help you understand your benefits, resolve claims, and fix billing errors — so you don't have to fight the insurer alone.")),
    React.createElement(Eyebrow, null, "How can we help?"),
    React.createElement(Card, { style: { marginBottom: 16 } }, [["Message my benefits team", "Ask anything about your coverage", "A general question"], ["Help with a bill", "We'll review a charge that looks wrong", "Help with a bill"], ["Dispute a denied claim", "We'll handle the appeal for you", "Dispute a denied claim"], ["Request a callback", "An advocate will call you", "Request a callback"]].map(([label, sub, t], i, a) =>
      React.createElement("div", { key: label, className: "press", onClick: () => open(t), style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: i < a.length - 1 ? `1px solid ${C.line}` : "none", cursor: "pointer" } },
        React.createElement("div", { style: { flex: 1, paddingRight: 10 } },
          React.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: C.ink } }, label),
          React.createElement("div", { style: { fontSize: 11.5, color: C.grey, marginTop: 2 } }, sub)),
        React.createElement(Icon, { name: "chevron", size: 16, color: C.greyLt, sw: 2 })))),
    React.createElement("div", { style: { padding: "13px 16px", marginBottom: 16, background: C.sky, borderRadius: 14 } },
      React.createElement("div", { style: { fontSize: 12.5, color: C.ink, fontWeight: 700 } }, "Atención disponible en español"),
      React.createElement("div", { style: { fontSize: 11.5, color: C.ink2, marginTop: 2 } }, "Spanish-speaking advocates are available by phone and message.")),
    React.createElement(Eyebrow, null, "Direct lines"),
    React.createElement(Card, null, [["Member advocacy", "1-888-460-9125"], ["Blue Shield member services", "1-800-393-6130"], ["24/7 nurse line", "1-877-304-0504"]].map(([k, v], i, a) =>
      React.createElement("a", { key: k, href: `tel:${v.replace(/[^0-9]/g, "")}`, className: "press", style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 18px", borderBottom: i < a.length - 1 ? `1px solid ${C.line}` : "none", textDecoration: "none" } },
        React.createElement("span", { style: { fontSize: 13.5, color: C.ink, fontWeight: 500 } }, k),
        React.createElement("span", { style: { fontSize: 13, color: C.action, fontWeight: 700, fontFamily: "monospace" } }, v)))));
}

// ── ON-DEVICE FALLBACK ANSWER ENGINE ──────────────────────────────────────────
function localAnswer(q: string) {
  const s = q.toLowerCase().trim();
  const has = (...w: string[]) => w.some((x) => s.includes(x));
  const me = byId("self");
  const dedLeft = me.ded.total - me.ded.used, oopLeft = me.oop.total - me.oop.used;
  if (s === "hi" || s === "hello" || s === "hey" || has("good morning", "good afternoon", "how are you")) return "Hi! Ask me about any part of your benefits — what's covered, what something costs, your deductible, dental, vision, your HSA, or how to find care near you.";
  if (has("thank")) return "You're welcome. Anything else about your benefits I can pull up?";
  if (has("deductible")) return `Your individual deductible is $${me.ded.total.toLocaleString()} and you've used $${me.ded.used.toLocaleString()}, so $${dedLeft.toLocaleString()} is left before the plan starts sharing costs. Your family deductible is $${FAMILY.ded.total.toLocaleString()} ($${FAMILY.ded.used.toLocaleString()} used so far). Preventive care and most copays don't count toward it.`;
  if (has("coinsurance", "80/20", "split the cost", "how much does insurance pay", "how is it split")) return "After you meet your deductible, costs split 80/20 — your plan pays 80%, you pay 20%. For example, a $2,400 MRI would cost you about $480. Once you reach your out-of-pocket max, covered in-network services are $0 for the rest of the year.";
  if (has("out of pocket", "out-of-pocket", "oop", "maximum", "most i", "max i'll", "max i will")) return `Your individual out-of-pocket max is $${me.oop.total.toLocaleString()} and you've paid $${me.oop.used.toLocaleString()}, so $${oopLeft.toLocaleString()} remains before the plan covers 100%. The family max is $${FAMILY.oop.total.toLocaleString()}. This cap includes your deductible, copays, and coinsurance — but not your monthly premium.`;
  if (has("preventive", "annual physical", "check up", "checkup", "screening", "well visit", "well-woman", "vaccine", "flu shot", "immuniz", "mammogram", "colonoscopy")) return "Preventive care is 100% covered at no cost to you — annual physicals, flu shots, cancer screenings like mammograms and colonoscopies, blood-pressure checks, well-woman visits, and routine vaccines — even before your deductible is met.";
  if (has("dental", "dentist", "teeth", "tooth", "cleaning", "filling", "crown", "root canal", "braces", "ortho", "cavity")) return "You have Delta Dental PPO. Cleanings and exams are 100% covered, fillings 80%, crowns 50%, with a $1,500 annual maximum per person and $1,500 lifetime orthodontia. Jordan and Maya are covered too. Customer service: 1-800-765-6003.";
  if (has("vision", "eye", "glasses", "contacts", "lenses", "frames", "vsp", "optometr", "eye exam")) return "Your VSP Choice plan covers an annual eye exam for a $10 copay, lenses in full, and a $150 frame allowance (or $150 toward contacts), once every 12 months. Customer service: 1-800-877-7195.";
  if (has("therapy", "therapist", "counsel", "mental", "psych", "lyra", "depress", "anxiety", "stress")) return "Two options: your medical plan covers in-network therapists at a $50 copay, and you also get 12 free sessions a year through Lyra Health with no referral. Use Find Care for in-network therapists, or go straight to Lyra at care.lyrahealth.com.";
  if (has("hsa", "health savings")) return `Your HSA balance is ${money2(HSA.balance)}. Use it tax-free for qualified expenses — copays, prescriptions, dental, vision, even some over-the-counter items. You've contributed $${HSA.ytdContrib.toLocaleString()} of the $${HSA.limit.toLocaleString()} 2026 limit, and the balance rolls over and grows year to year.`;
  if (has("fsa", "dependent care", "childcare", "child care", "daycare", "day care", "preschool", "nanny", "camp")) return `Your Dependent Care FSA has $${DCFSA.remaining.toLocaleString()} left of your $${DCFSA.election.toLocaleString()} election. It covers daycare, preschool, after-school care, summer day camp, and similar — all pre-tax. Funds must be used by Dec 31.`;
  if (has("401", "retirement", "match", "fidelity")) return "Your 401(k) is with Fidelity. The company matches 100% of the first 4% you contribute, and the match vests immediately. You're currently contributing 8% of pay.";
  if (has("copay", "co-pay", "co pay", "doctor visit", "urgent care", "emergency", "er visit", "telehealth", "generic", "brand", "prescription", "rx", "imaging", "mri", "ct scan", "lab", "physical therapy")) return "Your in-network copays: primary care $25, specialist $50, urgent care $75, ER $300 (waived if admitted), telehealth $0, mental health $50, generic Rx $10, brand Rx $45. Labs and imaging are 20% after your deductible. See Copays & Costs for the full list.";
  if (has("find care", "find a doctor", "near me", "in-network", "urgent care near")) return "Open the Find Care tab — it lists in-network primary care, specialists, urgent care, dermatology, mental health, and orthopedics near San Diego, each with your copay shown and one-tap directions.";
  if (has("bill", "overcharged", "wrong", "dispute", "denied", "appeal")) return "If a bill looks wrong or a claim was denied, don't pay it blind — go to Support and choose 'Help with a bill' or 'Dispute a denied claim.' A benefits advocate will review it against your plan and handle the dispute for you.";
  return "I can help with your medical, dental, vision, pharmacy, HSA, FSA, life, disability, and 401(k) benefits — what's covered, what something costs, your deductible and out-of-pocket progress, finding in-network care, or sorting out a bill. Try asking about a specific service, or head to Support to message a benefits advocate.";
}

// ── ASK AI (live Claude via /api/chat, on-device fallback) ────────────────────
function AskAI() {
  const [messages, setMessages] = useState<any[]>([{ role: "assistant", text: "Ask me anything about your benefits — medical, dental, vision, your HSA, what's covered, or how to use any of it." }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setInput("");
    const next = [...messages, { role: "user", text: q }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.text })) }) });
      if (!res.ok) throw new Error("chat failed");
      const data = await res.json();
      setMessages((p) => [...p, { role: "assistant", text: data.text || localAnswer(q) }]);
    } catch {
      setMessages((p) => [...p, { role: "assistant", text: localAnswer(q) }]);
    } finally {
      setLoading(false);
    }
  };
  return React.createElement("div", { style: { display: "flex", flexDirection: "column", height: "calc(100vh - 152px)", padding: "0 16px" } },
    React.createElement("div", { style: { flex: 1, overflowY: "auto", paddingBottom: 12 } },
      messages.map((m, i) => {
        const u = m.role === "user";
        return React.createElement("div", { key: i, style: { display: "flex", justifyContent: u ? "flex-end" : "flex-start", marginBottom: 10, gap: 8, alignItems: "flex-end", animation: "rise .25s ease" } },
          !u && React.createElement("div", { style: { width: 28, height: 28, borderRadius: "50%", background: C.ink, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 } }, React.createElement("img", { src: M_WHITE, alt: "", style: { width: 16 } })),
          React.createElement("div", { style: { maxWidth: "80%", padding: "11px 14px", background: u ? C.ink : C.surface, color: u ? "#fff" : C.ink2, border: u ? "none" : `1px solid ${C.line}`, borderRadius: u ? "16px 16px 4px 16px" : "16px 16px 16px 4px", fontSize: 13.5, lineHeight: 1.6, boxShadow: u ? "none" : SH } }, m.text));
      }),
      loading && React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 10 } },
        React.createElement("div", { style: { width: 28, height: 28, borderRadius: "50%", background: C.ink, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" } }, React.createElement("img", { src: M_WHITE, alt: "", style: { width: 16 } })),
        React.createElement("div", { style: { background: C.surface, border: `1px solid ${C.line}`, borderRadius: "16px 16px 16px 4px", padding: "13px 16px", display: "flex", gap: 5 } }, [0, 1, 2].map((i) => React.createElement("div", { key: i, style: { width: 5, height: 5, borderRadius: "50%", background: C.grey, animation: "dot 1.2s infinite", animationDelay: `${i * 0.2}s` } })))),
      React.createElement("div", { ref: endRef })),
    React.createElement("div", { style: { marginBottom: 10 } },
      React.createElement("div", { style: { fontSize: 10.5, fontWeight: 700, color: C.grey, textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 8 } }, "Popular questions · tap to ask"),
      React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } }, PRESET_Q.map((q) => React.createElement("button", { key: q, className: "press", onClick: () => send(q), style: { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: "6px 12px", fontSize: 12.5, color: C.ink2, fontWeight: 500, cursor: "pointer" } }, q)))),
    React.createElement("div", { style: { display: "flex", gap: 8, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "8px 8px 8px 14px", marginBottom: 6, boxShadow: SH } },
      React.createElement("input", { value: input, onChange: (e: any) => setInput(e.target.value), onKeyDown: (e: any) => e.key === "Enter" && send(input), placeholder: "Ask about your benefits…", style: { flex: 1, border: "none", outline: "none", fontSize: 14, color: C.ink, background: "transparent", fontFamily: "inherit" } }),
      React.createElement("button", { className: "press", onClick: () => send(input), disabled: !input.trim() || loading, style: { background: input.trim() && !loading ? C.action : C.line, color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" } }, "Send")));
}

// ── PROFILE ───────────────────────────────────────────────────────────────────
function Profile() {
  const [notif, setNotif] = useState<any>({ claims: true, eob: true, advocate: true });
  const self = byId("self");
  return React.createElement("div", { style: { padding: "0 16px 32px" } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14, marginBottom: 20, padding: "18px", background: C.surface, borderRadius: 16, border: `1px solid ${C.line}`, boxShadow: SH } },
      React.createElement("div", { style: { width: 54, height: 54, borderRadius: "50%", background: C.ink, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 18, fontWeight: 800, flexShrink: 0 } }, self.initials),
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 17, fontWeight: 800, color: C.ink, letterSpacing: "-.02em" } }, self.name),
        React.createElement("div", { style: { fontSize: 11, color: C.grey, marginTop: 3, fontFamily: "monospace", letterSpacing: ".04em" } }, self.memberId),
        React.createElement("div", { style: { fontSize: 11.5, color: C.ink2, fontWeight: 700, marginTop: 3 } }, PLAN.name))),
    React.createElement(Eyebrow, null, "Covered household"),
    React.createElement(Card, { style: { marginBottom: 16 } }, HOUSEHOLD.map((m, i) =>
      React.createElement("div", { key: m.id, style: { display: "flex", alignItems: "center", gap: 13, padding: "13px 18px", borderBottom: i < HOUSEHOLD.length - 1 ? `1px solid ${C.line}` : "none" } },
        React.createElement("div", { style: { width: 38, height: 38, borderRadius: "50%", background: C.faint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: C.ink2, flexShrink: 0 } }, m.initials),
        React.createElement("div", { style: { flex: 1 } },
          React.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: C.ink } }, m.name),
          React.createElement("div", { style: { fontSize: 11.5, color: C.grey, marginTop: 1 } }, m.rel, " · ", m.memberId))))),
    React.createElement(Eyebrow, null, "Plan information"),
    React.createElement(Card, { style: { marginBottom: 16 } }, [["Group number", PLAN.group], ["Coverage tier", PLAN.tier], ["Effective date", PLAN.effective], ["Plan year", PLAN.planYear]].map(([k, v], i, a) => React.createElement(Row, { key: k, left: k, right: v, rightColor: C.ink2, last: i === a.length - 1 }))),
    React.createElement(Eyebrow, null, "Notifications"),
    React.createElement(Card, { style: { marginBottom: 16 } }, [["When a claim is processed", "claims"], ["When a new EOB is ready", "eob"], ["When my advocate replies", "advocate"]].map(([label, key], i, a) =>
      React.createElement("div", { key, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: i < a.length - 1 ? `1px solid ${C.line}` : "none" } },
        React.createElement("span", { style: { fontSize: 13.5, color: C.ink, fontWeight: 500 } }, label),
        React.createElement("div", { onClick: () => setNotif((n: any) => ({ ...n, [key]: !n[key] })), style: { width: 44, height: 26, borderRadius: 13, background: notif[key] ? C.ink : C.line, cursor: "pointer", position: "relative", transition: "background .2s", flexShrink: 0 } },
          React.createElement("div", { style: { width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: notif[key] ? 21 : 3, transition: "left .2s", boxShadow: "0 1px 4px rgba(0,0,0,.18)" } }))))),
    React.createElement("button", { className: "press", onClick: () => signOut({ callbackUrl: "/login" }), style: { width: "100%", background: "none", border: `1px solid ${C.line}`, color: C.grey, borderRadius: 11, padding: "13px 0", fontSize: 13.5, fontWeight: 600, cursor: "pointer" } }, "Sign out"));
}

// ── NAV + ROOT ────────────────────────────────────────────────────────────────
const NAV = [
  { id: "home", label: "Wallet", icon: "home" }, { id: "benefits", label: "Benefits", icon: "layers" },
  { id: "findcare", label: "Find Care", icon: "search" }, { id: "chat", label: "Ask AI", icon: "chat" },
  { id: "support", label: "Support", icon: "life" },
];
const TITLES: any = { home: "My Wallet", benefits: "My Benefits", findcare: "Find Care", chat: "Benefits AI", support: "Support", coverage: "Medical Coverage", copays: "Copays & Costs", cost: "Cost Estimator", hsa: "HSA Account", fsa: "Dependent Care FSA", docs: "Documents", claims: "Claims & EOBs", profile: "Profile" };
const BACK: any = { coverage: "benefits", copays: "benefits", hsa: "benefits", fsa: "benefits", benefitDetail: "benefits", claims: "home", docs: "home", cost: "home", profile: "home" };

export default function BenefitsApp({ data }: { data: Bootstrap }) {
  hydrate(data);
  const [tab, setTab] = useState("home");
  const [benefitId, setBenefitId] = useState<string | null>(null);
  const navSet = new Set(NAV.map((n) => n.id));
  const openBenefit = (id: string) => { setBenefitId(id); setTab("benefitDetail"); };
  const title = tab === "benefitDetail" ? (PKG[benefitId as string]?.name || "Benefit") : TITLES[tab];
  return React.createElement("div", { style: { fontFamily: "'Noto Sans', -apple-system, 'SF Pro Text', BlinkMacSystemFont, sans-serif", background: C.paper, minHeight: "100vh", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" } },
    React.createElement("div", { style: { background: C.ink, padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 20 } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 11 } },
        React.createElement("img", { src: M_WHITE, alt: "Marsh", style: { height: 26 } }),
        React.createElement("div", { style: { width: 1, height: 22, background: "rgba(255,255,255,.22)" } }),
        React.createElement("div", { style: { fontSize: 17, fontWeight: 600, color: "#fff", letterSpacing: "-.01em" } }, title)),
      React.createElement("div", { style: { display: "flex", gap: 10, alignItems: "center" } },
        !navSet.has(tab) && React.createElement("button", { className: "press", onClick: () => setTab(BACK[tab] || "home"), style: { background: "transparent", border: "1px solid rgba(255,255,255,.3)", borderRadius: 9, padding: "6px 11px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" } }, "← Back"),
        React.createElement("button", { className: "press", onClick: () => setTab("profile"), style: { width: 34, height: 34, borderRadius: "50%", background: C.sky, border: "none", cursor: "pointer", color: C.ink, fontSize: 12.5, fontWeight: 800 } }, byId("self").initials))),
    React.createElement("div", { key: tab, className: "page", style: { flex: 1, overflowY: "auto", paddingTop: 16 } },
      tab === "home" && React.createElement(Home, { setTab }),
      tab === "benefits" && React.createElement(Benefits, { setTab, openBenefit }),
      tab === "benefitDetail" && React.createElement(BenefitDetail, { id: benefitId }),
      tab === "coverage" && React.createElement(Coverage, null),
      tab === "copays" && React.createElement(Copays, null),
      tab === "findcare" && React.createElement(FindCare, null),
      tab === "chat" && React.createElement(AskAI, null),
      tab === "claims" && React.createElement(Claims, null),
      tab === "cost" && React.createElement(CostEstimator, null),
      tab === "hsa" && React.createElement(HSAScreen, null),
      tab === "fsa" && React.createElement(FSAScreen, null),
      tab === "docs" && React.createElement(Documents, null),
      tab === "support" && React.createElement(Support, null),
      tab === "profile" && React.createElement(Profile, null)),
    React.createElement("div", { style: { background: C.surface, borderTop: `1px solid ${C.line}`, display: "flex", position: "sticky", bottom: 0, zIndex: 20 } }, NAV.map((n) => {
      const on = tab === n.id;
      return React.createElement("button", { key: n.id, onClick: () => setTab(n.id), style: { flex: 1, border: "none", background: "transparent", cursor: "pointer", padding: "10px 4px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, position: "relative" } },
        on && React.createElement("div", { style: { position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 26, height: 3, background: C.gold, borderRadius: "0 0 3px 3px" } }),
        React.createElement(Icon, { name: n.icon, size: 20, color: on ? C.ink : C.greyLt, sw: on ? 2.1 : 1.7 }),
        React.createElement("span", { style: { fontSize: 10, fontWeight: on ? 700 : 500, color: on ? C.ink : C.grey } }, n.label));
    })),
    React.createElement("style", null, `
      * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      ::-webkit-scrollbar { display: none; }
      input::placeholder, textarea::placeholder { color: ${C.grey}; }
      button { font-family: inherit; }
      .press { transition: transform .12s ease, opacity .12s ease; }
      .press:active { transform: scale(.975); opacity: .9; }
      .page { animation: fadeRise .42s cubic-bezier(.4,0,.2,1); }
      @keyframes fadeRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
      @keyframes dot { 0%,80%,100%{opacity:.3;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }
      @keyframes rise { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
    `));
}
