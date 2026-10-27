import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  telegramSubject: text("telegram_subject").notNull().unique(),
  username: text("username"),
  displayName: text("display_name").notNull(),
  disabled: integer("disabled").notNull().default(0),
});

export const sessions = sqliteTable("sessions", {
  idHash: text("id_hash").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  idleExpiresAt: integer("idle_expires_at").notNull(),
}, table => [index("sessions_account_idx").on(table.accountId)]);

export const methodologistWhitelist = sqliteTable("methodologist_whitelist", {
  telegramSubject: text("telegram_subject").primaryKey(),
  grantedAt: integer("granted_at").notNull().default(0),
  grantedBy: text("granted_by"),
});

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => accounts.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  contentJson: text("content_json").notNull().default('{"sections":[]}'),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  deletedAt: integer("deleted_at"),
}, table => [index("plans_owner_updated_idx").on(table.ownerId, table.updatedAt)]);

export const planSections = sqliteTable("plan_sections", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  title: text("title").notNull().default(""),
  position: integer("position").notNull(),
}, table => [index("sections_plan_position_idx").on(table.planId, table.position)]);

export const poses = sqliteTable("poses", {
  id: text("id").primaryKey(),
  nameUk: text("name_uk").notNull(),
  nameEn: text("name_en"),
  difficulty: integer("difficulty").notNull(),
  imageUrl: text("image_url"),
  active: integer("active").notNull().default(1),
  imageAllowed: integer("image_allowed").notNull().default(1),
}, table => [index("poses_active_difficulty_idx").on(table.active, table.difficulty)]);

export const planExercises = sqliteTable("plan_exercises", {
  id: text("id").primaryKey(),
  sectionId: text("section_id").notNull().references(() => planSections.id, { onDelete: "cascade" }),
  poseId: text("pose_id").references(() => poses.id),
  title: text("title").notNull(),
  durationSeconds: integer("duration_seconds"),
  breaths: integer("breaths"),
  note: text("note").notNull().default(""),
  position: integer("position").notNull(),
}, table => [index("exercises_section_position_idx").on(table.sectionId, table.position)]);

export const shareLinks = sqliteTable("share_links", {
  planId: text("plan_id").primaryKey().references(() => plans.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: integer("created_at").notNull(),
  revokedAt: integer("revoked_at"),
});

export const cohorts = sqliteTable("cohorts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const cohortModules = sqliteTable("cohort_modules", {
  cohortId: text("cohort_id").notNull().references(() => cohorts.id, { onDelete: "cascade" }),
  moduleNumber: integer("module_number").notNull(),
}, table => [primaryKey({ columns: [table.cohortId, table.moduleNumber] })]);

export const students = sqliteTable("students", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact"),
  note: text("note").notNull().default(""),
  status: text("status").notNull().default("active"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const enrollments = sqliteTable("enrollments", {
  id: text("id").primaryKey(),
  cohortId: text("cohort_id").notNull().references(() => cohorts.id),
  studentId: text("student_id").notNull().references(() => students.id),
  startingProfile: text("starting_profile").notNull(),
  archived: integer("archived").notNull().default(0),
  createdAt: integer("created_at").notNull(),
}, table => [uniqueIndex("enrollments_cohort_student_uq").on(table.cohortId, table.studentId)]);

export const assessments = sqliteTable("assessments", {
  id: text("id").primaryKey(),
  enrollmentId: text("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(),
  scoresJson: text("scores_json").notNull().default("{}"),
  version: integer("version").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
  updatedBy: text("updated_by").notNull().references(() => accounts.id),
}, table => [uniqueIndex("assessments_enrollment_stage_uq").on(table.enrollmentId, table.stage)]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").references(() => accounts.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
}, table => [index("audit_entity_idx").on(table.entityType, table.entityId, table.createdAt)]);
