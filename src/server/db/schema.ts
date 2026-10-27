import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => tstz("created_at").notNull().defaultNow();

export const cohortStatus = pgEnum("cohort_status", ["active", "archived"]);
export const startingProfile = pgEnum("starting_profile", ["polishing", "reframing", "from_zero"]);

export const account = pgTable("account", {
  id: id(),
  telegramId: bigint("telegram_id", { mode: "bigint" }).notNull().unique(),
  name: text("name"),
  username: text("username"),
  phone: text("phone"),
  photoUrl: text("photo_url"),
  locale: text("locale").notNull().default("uk"),
  createdAt: createdAt(),
  lastLoginAt: tstz("last_login_at"),
  disabledAt: tstz("disabled_at"),
});

export const session = pgTable("session", {
  id: id(),
  tokenHash: text("token_hash").notNull().unique(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => account.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  expiresAt: tstz("expires_at").notNull(),
  lastSeenAt: tstz("last_seen_at").notNull().defaultNow(),
});

export const plan = pgTable(
  "plan",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => account.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    document: jsonb("document").notNull(),
    version: integer("version").notNull().default(1),
    /** Client-generated id of the last applied save; lets a client recognise its own write after a lost response. */
    lastSaveId: text("last_save_id"),
    shareToken: text("share_token").unique(),
    shareEnabledAt: tstz("share_enabled_at"),
    createdAt: createdAt(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
    deletedAt: tstz("deleted_at"),
  },
  (t) => [index("plan_owner_updated_idx").on(t.ownerId, t.updatedAt)],
);

export const cohort = pgTable("cohort", {
  id: id(),
  name: varchar("name", { length: 80 }).notNull(),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  status: cohortStatus("status").notNull().default("active"),
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const cohortModule = pgTable(
  "cohort_module",
  {
    cohortId: uuid("cohort_id")
      .notNull()
      .references(() => cohort.id, { onDelete: "cascade" }),
    moduleNumber: smallint("module_number").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.cohortId, t.moduleNumber] }),
    check("cohort_module_number_range", sql`${t.moduleNumber} between 1 and 12`),
  ],
);

export const student = pgTable("student", {
  id: id(),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  contact: text("contact"),
  note: text("note"),
  archivedAt: tstz("archived_at"),
  createdAt: createdAt(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

export const enrollment = pgTable(
  "enrollment",
  {
    id: id(),
    cohortId: uuid("cohort_id")
      .notNull()
      .references(() => cohort.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => student.id, { onDelete: "restrict" }),
    startingProfile: startingProfile("starting_profile").notNull(),
    archivedAt: tstz("archived_at"),
    createdAt: createdAt(),
  },
  (t) => [unique("enrollment_cohort_student_uniq").on(t.cohortId, t.studentId)],
);

export const assessmentStage = pgTable(
  "assessment_stage",
  {
    id: id(),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollment.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => account.id, { onDelete: "set null" }),
  },
  (t) => [
    unique("assessment_stage_enrollment_stage_uniq").on(t.enrollmentId, t.stage),
    check("assessment_stage_valid", sql`${t.stage} = 'point0' or ${t.stage} = 'final' or ${t.stage} ~ '^m([1-9]|1[0-2])$'`),
  ],
);

export const assessmentScore = pgTable(
  "assessment_score",
  {
    stageId: uuid("stage_id")
      .notNull()
      .references(() => assessmentStage.id, { onDelete: "cascade" }),
    competencyCode: text("competency_code").notNull(),
    score: smallint("score").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.stageId, t.competencyCode] }),
    check("assessment_score_range", sql`${t.score} between 0 and 10`),
  ],
);

export const auditEvent = pgTable("audit_event", {
  id: id(),
  actorId: uuid("actor_id").references(() => account.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: uuid("entity_id"),
  data: jsonb("data"),
  createdAt: createdAt(),
});
