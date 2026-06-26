import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`);

// ── Auth / account holder ────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  // The member id of the primary subscriber (mirrors HOUSEHOLD "self")
  primaryMemberId: text("primary_member_id"),
  createdAt: createdAt(),
});

// ── Plan (one active medical plan per user, like PLAN + FAMILY) ───────────
export const plans = sqliteTable("plans", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  groupNumber: text("group_number").notNull(),
  effective: text("effective").notNull(),
  tier: text("tier").notNull(),
  phone: text("phone").notNull(),
  planYear: text("plan_year").notNull(),
  familyDedUsed: real("family_ded_used").notNull(),
  familyDedTotal: real("family_ded_total").notNull(),
  familyOopUsed: real("family_oop_used").notNull(),
  familyOopTotal: real("family_oop_total").notNull(),
});

// ── Household members (self, spouse, dependents) ──────────────────────────
export const members = sqliteTable("members", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // stable slug used across the app (self/spouse/child)
  ref: text("ref").notNull(),
  name: text("name").notNull(),
  first: text("first").notNull(),
  initials: text("initials").notNull(),
  rel: text("rel").notNull(),
  memberId: text("member_id").notNull(),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  dedUsed: real("ded_used").notNull(),
  dedTotal: real("ded_total").notNull(),
  oopUsed: real("oop_used").notNull(),
  oopTotal: real("oop_total").notNull(),
});

// ── Benefit packages (medical, dental, vision, hsa, 401k, …) ──────────────
export const benefitPackages = sqliteTable("benefit_packages", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  key: text("key").notNull(), // medical, dental, hsa, …
  name: text("name").notNull(),
  carrier: text("carrier").notNull(),
  status: text("status").notNull(), // enrolled | none
  summary: text("summary").notNull(),
  rows: text("rows", { mode: "json" }).notNull().$type<[string, string][]>(),
  call: text("call").notNull().default(""),
  web: text("web").notNull().default(""),
  groupTitle: text("group_title").notNull(), // section header in Benefits screen
  route: text("route").notNull(), // detail | coverage | copays | hsa | fsa
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── Claims / EOBs ─────────────────────────────────────────────────────────
export const claims = sqliteTable("claims", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  memberRef: text("member_ref").notNull(), // self/spouse/child
  date: text("date").notNull(),
  sortDate: integer("sort_date").notNull(), // epoch for ordering
  provider: text("provider").notNull(),
  service: text("service").notNull(),
  billed: real("billed").notNull(),
  planPaid: real("plan_paid").notNull(),
  you: real("you").notNull(),
  status: text("status").notNull().default("paid"),
});

// ── Spending accounts (HSA, Dependent-Care FSA) ───────────────────────────
export const accounts = sqliteTable("accounts", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // hsa | dcfsa
  data: text("data", { mode: "json" }).notNull().$type<Record<string, number | string>>(),
});

// ── Documents (SBC, EOBs, certificates) ───────────────────────────────────
export const documents = sqliteTable("documents", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  date: text("date").notNull(),
  type: text("type").notNull(),
  url: text("url").notNull().default(""),
});

// ── Support messages to the advocacy team ─────────────────────────────────
export const supportMessages = sqliteTable("support_messages", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  topic: text("topic").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: createdAt(),
});

// ── Plan reference data (shared, not user-specific) ───────────────────────
export const copays = sqliteTable("copays", {
  id: id(),
  label: text("label").notNull(),
  cost: text("cost").notNull(),
  note: text("note").notNull(),
  network: text("network").notNull().default("in"), // in | out
  sortOrder: integer("sort_order").notNull().default(0),
});

export const coverageItems = sqliteTable("coverage_items", {
  id: id(),
  label: text("label").notNull(),
  detail: text("detail").notNull(),
  status: text("status").notNull(), // full | partial | none
  sortOrder: integer("sort_order").notNull().default(0),
});

export const priorAuth = sqliteTable("prior_auth", {
  id: id(),
  service: text("service").notNull(),
  required: integer("required", { mode: "boolean" }).notNull(),
  note: text("note").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const costProcedures = sqliteTable("cost_procedures", {
  id: id(),
  label: text("label").notNull(),
  cost: real("cost").notNull(),
  note: text("note").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const careCategories = sqliteTable("care_categories", {
  id: id(),
  ref: text("ref").notNull().unique(), // pcp, cardio, …
  label: text("label").notNull(),
  copay: text("copay").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const providers = sqliteTable("providers", {
  id: id(),
  categoryRef: text("category_ref").notNull(), // -> careCategories.ref
  name: text("name").notNull(),
  org: text("org").notNull(),
  addr: text("addr").notNull(),
  phone: text("phone").notNull(),
  rating: real("rating").notNull(),
  reviews: integer("reviews").notNull(),
  hours: text("hours").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});
