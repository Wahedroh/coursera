import { sql } from 'drizzle-orm'
import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const schools = sqliteTable('schools', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: integer('created_at').notNull(),
})

export const classes = sqliteTable('classes', {
  id: text('id').primaryKey(),
  schoolId: text('school_id')
    .notNull()
    .references(() => schools.id),
  grade: integer('grade'),
  name: text('name').notNull().unique(),
  joinCode: text('join_code').notNull().unique(),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
})

export const students = sqliteTable('students', {
  id: text('id').primaryKey(),
  zipgradeId: text('zipgrade_id').notNull().unique(),
  classId: text('class_id')
    .notNull()
    .references(() => classes.id),
  title: text('title'),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  sortOrder: integer('sort_order').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  pinHash: text('pin_hash'),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: integer('locked_until'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['teacher', 'student'] }).notNull(),
  studentId: text('student_id').references(() => students.id),
  tokenHash: text('token_hash').notNull().unique(),
  userAgent: text('user_agent').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  revokedAt: integer('revoked_at'),
  flaggedNewDevice: integer('flagged_new_device', { mode: 'boolean' }).notNull().default(false),
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: integer('window_start').notNull(),
  count: integer('count').notNull(),
})

export const assignments = sqliteTable('assignments', {
  id: text('id').primaryKey(),
  classId: text('class_id')
    .notNull()
    .references(() => classes.id),
  title: text('title').notNull(),
  instructions: text('instructions').notNull().default(''),
  attachmentKeys: text('attachment_keys', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  dueAt: integer('due_at'),
  maxScore: real('max_score').notNull(),
  submitMode: text('submit_mode', { enum: ['text', 'image', 'both'] }).notNull(),
  published: integer('published', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const submissions = sqliteTable(
  'submissions',
  {
    id: text('id').primaryKey(),
    assignmentId: text('assignment_id')
      .notNull()
      .references(() => assignments.id),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    text: text('text').notNull().default(''),
    imageKeys: text('image_keys', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    annotatedKeys: text('annotated_keys', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    status: text('status', { enum: ['submitted', 'late', 'graded', 'returned'] }).notNull(),
    submittedAt: integer('submitted_at').notNull(),
    score: real('score'),
    comment: text('comment').notNull().default(''),
    gradedAt: integer('graded_at'),
    clientRequestId: text('client_request_id'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('submissions_assignment_student_unique').on(t.assignmentId, t.studentId)],
)

export const pointEvents = sqliteTable(
  'point_events',
  {
    id: text('id').primaryKey(),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    delta: integer('delta').notNull(),
    reason: text('reason').notNull(),
    source: text('source', { enum: ['manual', 'assignment', 'attendance', 'live'] }).notNull(),
    refId: text('ref_id'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('point_events_source_ref_unique').on(t.source, t.refId)],
)
