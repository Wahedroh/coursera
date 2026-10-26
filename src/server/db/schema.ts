import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
