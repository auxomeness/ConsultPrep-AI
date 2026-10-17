import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const appRole = pgEnum("app_role", ["patient", "clinician"]);
export const intakeSessionStatus = pgEnum("intake_session_status", [
  "in_progress",
  "ready_for_review",
  "confirmed_by_patient",
  "submitted",
]);
export const patientResponseKind = pgEnum("patient_response_kind", [
  "reported",
  "unknown",
  "skipped",
]);
export const consultationBriefStatus = pgEnum("consultation_brief_status", [
  "draft",
  "patient_confirmed",
  "clinician_finalized",
]);
export const consultationCaseStatus = pgEnum("consultation_case_status", [
  "submitted",
  "under_clinician_review",
  "finalized",
]);
export const clinicianRevisionAction = pgEnum("clinician_revision_action", [
  "draft_saved",
  "finalized",
]);

// Supabase Auth owns identities. This table stores only application role data.
// Role assignment is provisioned through a trusted server/admin path, never by clients.
const authUsers = pgSchema("auth").table("users", {
  id: uuid("id").primaryKey(),
});

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().references(() => authUsers.id, { onDelete: "restrict" }),
  role: appRole("role").notNull().default("patient"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const intakeSessions = pgTable(
  "intake_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
    status: intakeSessionStatus("status").notNull().default("in_progress"),
    schemaVersion: text("schema_version").notNull().default("v1"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (table) => [
    unique("intake_sessions_id_patient_unique").on(table.id, table.patientId),
    index("intake_sessions_patient_updated_idx").on(table.patientId, table.updatedAt.desc()),
    check(
      "intake_sessions_submitted_at_matches_status",
      sql`(${table.status} = 'submitted') = (${table.submittedAt} is not null)`,
    ),
  ],
);

export const patientResponses = pgTable(
  "patient_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intakeSessionId: uuid("intake_session_id").notNull(),
    sequence: integer("sequence").notNull(),
    questionId: text("question_id"),
    questionText: text("question_text"),
    kind: patientResponseKind("kind").notNull().default("reported"),
    responseText: text("response_text"),
    supersedesResponseId: uuid("supersedes_response_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("patient_responses_session_sequence_unique").on(table.intakeSessionId, table.sequence),
    unique("patient_responses_id_session_unique").on(table.id, table.intakeSessionId),
    index("patient_responses_session_created_idx").on(table.intakeSessionId, table.createdAt),
    foreignKey({
      name: "patient_responses_session_fk",
      columns: [table.intakeSessionId],
      foreignColumns: [intakeSessions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "patient_responses_supersedes_same_session_fk",
      columns: [table.supersedesResponseId, table.intakeSessionId],
      foreignColumns: [table.id, table.intakeSessionId],
    }).onDelete("restrict"),
    check("patient_responses_sequence_positive", sql`${table.sequence} > 0`),
    check(
      "patient_responses_reported_text_required",
      sql`(${table.kind} <> 'reported') or (${table.responseText} is not null and length(btrim(${table.responseText})) > 0)`,
    ),
    check("patient_responses_not_self_superseding", sql`${table.supersedesResponseId} is distinct from ${table.id}`),
  ],
);

export const consultationBriefs = pgTable(
  "consultation_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intakeSessionId: uuid("intake_session_id").notNull(),
    version: integer("version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    status: consultationBriefStatus("status").notNull().default("draft"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    generatedBy: text("generated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("consultation_briefs_session_version_unique").on(table.intakeSessionId, table.version),
    unique("consultation_briefs_id_session_unique").on(table.id, table.intakeSessionId),
    index("consultation_briefs_session_created_idx").on(table.intakeSessionId, table.createdAt.desc()),
    foreignKey({
      name: "consultation_briefs_session_fk",
      columns: [table.intakeSessionId],
      foreignColumns: [intakeSessions.id],
    }).onDelete("restrict"),
    check("consultation_briefs_version_positive", sql`${table.version} > 0`),
    check("consultation_briefs_data_is_object", sql`jsonb_typeof(${table.data}) = 'object'`),
  ],
);

export const briefSourceReferences = pgTable(
  "brief_source_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    briefId: uuid("brief_id").notNull(),
    intakeSessionId: uuid("intake_session_id").notNull(),
    fieldPath: text("field_path").notNull(),
    patientResponseId: uuid("patient_response_id").notNull(),
    sourceExcerpt: text("source_excerpt"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("brief_source_refs_unique").on(table.briefId, table.fieldPath, table.patientResponseId),
    index("brief_source_refs_response_idx").on(table.patientResponseId),
    foreignKey({
      name: "brief_source_refs_brief_same_session_fk",
      columns: [table.briefId, table.intakeSessionId],
      foreignColumns: [consultationBriefs.id, consultationBriefs.intakeSessionId],
    }).onDelete("restrict"),
    foreignKey({
      name: "brief_source_refs_response_same_session_fk",
      columns: [table.patientResponseId, table.intakeSessionId],
      foreignColumns: [patientResponses.id, patientResponses.intakeSessionId],
    }).onDelete("restrict"),
    check("brief_source_refs_field_path_nonempty", sql`length(btrim(${table.fieldPath})) > 0`),
  ],
);

export const consultationCases = pgTable(
  "consultation_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intakeSessionId: uuid("intake_session_id").notNull().unique(),
    briefId: uuid("brief_id").notNull().unique(),
    status: consultationCaseStatus("status").notNull().default("submitted"),
    assignedClinicianId: uuid("assigned_clinician_id").references(() => profiles.id, { onDelete: "restrict" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("consultation_cases_id_session_unique").on(table.id, table.intakeSessionId),
    index("consultation_cases_clinician_status_idx").on(table.assignedClinicianId, table.status),
    foreignKey({
      name: "consultation_cases_session_fk",
      columns: [table.intakeSessionId],
      foreignColumns: [intakeSessions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "consultation_cases_brief_same_session_fk",
      columns: [table.briefId, table.intakeSessionId],
      foreignColumns: [consultationBriefs.id, consultationBriefs.intakeSessionId],
    }).onDelete("restrict"),
    check(
      "consultation_cases_finalized_at_matches_status",
      sql`(${table.status} = 'finalized') = (${table.finalizedAt} is not null)`,
    ),
  ],
);

/** One durable idempotency receipt per submitted intake. The case's unique
 * intake_session_id remains the second line of defense against duplicate cases. */
export const submissionReceipts = pgTable(
  "submission_receipts",
  {
    idempotencyKey: uuid("idempotency_key").primaryKey(),
    intakeSessionId: uuid("intake_session_id").notNull().unique("submission_receipts_session_unique"),
    caseId: uuid("case_id").notNull().unique("submission_receipts_case_unique"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "submission_receipts_case_same_session_fk",
      columns: [table.caseId, table.intakeSessionId],
      foreignColumns: [consultationCases.id, consultationCases.intakeSessionId],
    }).onDelete("restrict"),
  ],
);

export const clinicianRevisions = pgTable(
  "clinician_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id").notNull(),
    clinicianId: uuid("clinician_id").notNull().references(() => profiles.id, { onDelete: "restrict" }),
    action: clinicianRevisionAction("action").notNull(),
    briefData: jsonb("brief_data").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("clinician_revisions_case_created_idx").on(table.caseId, table.createdAt.desc()),
    foreignKey({
      name: "clinician_revisions_case_fk",
      columns: [table.caseId],
      foreignColumns: [consultationCases.id],
    }).onDelete("restrict"),
    check("clinician_revisions_data_is_object", sql`jsonb_typeof(${table.briefData}) = 'object'`),
  ],
);
