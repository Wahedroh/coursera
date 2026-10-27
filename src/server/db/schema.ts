import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

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
}, (t) => [index('students_class_idx').on(t.classId)])

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
}, (t) => [index('sessions_student_idx').on(t.studentId)])

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
}, (t) => [index('assignments_class_idx').on(t.classId)])

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
    /** ครูลบรูปงาน (ที่ตรวจแล้ว) เพื่อประหยัดพื้นที่ — คะแนน/คอมเมนต์ยังอยู่ */
    imagesPurgedAt: integer('images_purged_at'),
    clientRequestId: text('client_request_id'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('submissions_student_idx').on(t.studentId), uniqueIndex('submissions_assignment_student_unique').on(t.assignmentId, t.studentId)],
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
  (t) => [index('point_events_student_idx').on(t.studentId), uniqueIndex('point_events_source_ref_unique').on(t.source, t.refId)],
)

export const attendanceDays = sqliteTable(
  'attendance_days',
  {
    id: text('id').primaryKey(),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id),
    date: text('date').notNull(),
    selfCheckinOpen: integer('self_checkin_open', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('attendance_days_class_date_unique').on(t.classId, t.date)],
)

export const attendanceRecords = sqliteTable(
  'attendance_records',
  {
    id: text('id').primaryKey(),
    dayId: text('day_id')
      .notNull()
      .references(() => attendanceDays.id),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    status: text('status', { enum: ['present', 'late', 'sick', 'leave', 'absent'] }).notNull(),
    source: text('source', { enum: ['teacher', 'self'] }).notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('attendance_records_student_idx').on(t.studentId), uniqueIndex('attendance_records_day_student_unique').on(t.dayId, t.studentId)],
)

export const seating = sqliteTable('seating', {
  classId: text('class_id')
    .primaryKey()
    .references(() => classes.id),
  layout: text('layout', { mode: 'json' }).$type<{ cols: number; seats: (string | null)[] }>().notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const eggs = sqliteTable(
  'eggs',
  {
    id: text('id').primaryKey(),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    level: integer('level').notNull(),
    characterId: text('character_id'),
    openedAt: integer('opened_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('eggs_student_level_unique').on(t.studentId, t.level)],
)

export const scoreItems = sqliteTable('score_items', {
  id: text('id').primaryKey(),
  classId: text('class_id')
    .notNull()
    .references(() => classes.id),
  title: text('title').notNull(),
  category: text('category', { enum: ['quiz', 'midterm', 'final', 'other'] }).notNull(),
  maxScore: real('max_score').notNull(),
  takenOn: text('taken_on').notNull(),
  published: integer('published', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [index('score_items_class_idx').on(t.classId)])

export const scores = sqliteTable(
  'scores',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => scoreItems.id),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    score: real('score'),
    absent: integer('absent', { mode: 'boolean' }).notNull().default(false),
    note: text('note').notNull().default(''),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('scores_student_idx').on(t.studentId), uniqueIndex('scores_item_student_unique').on(t.itemId, t.studentId)],
)

export const videos = sqliteTable('videos', {
  id: text('id').primaryKey(),
  classId: text('class_id')
    .notNull()
    .references(() => classes.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  youtubeId: text('youtube_id').notNull(),
  published: integer('published', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('videos_class_idx').on(t.classId)])

export const materials = sqliteTable('materials', {
  id: text('id').primaryKey(),
  classId: text('class_id')
    .notNull()
    .references(() => classes.id),
  title: text('title').notNull(),
  topic: text('topic').notNull().default(''),
  fileKey: text('file_key').notNull(),
  fileName: text('file_name').notNull(),
  size: integer('size').notNull(),
  published: integer('published', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('materials_class_idx').on(t.classId)])

export const announcements = sqliteTable('announcements', {
  id: text('id').primaryKey(),
  classId: text('class_id')
    .notNull()
    .references(() => classes.id),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  expiresOn: text('expires_on'),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('announcements_class_idx').on(t.classId)])

export const announcementReads = sqliteTable(
  'announcement_reads',
  {
    announcementId: text('announcement_id')
      .notNull()
      .references(() => announcements.id),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    readAt: integer('read_at').notNull(),
  },
  (t) => [uniqueIndex('announcement_reads_unique').on(t.announcementId, t.studentId)],
)

export const feeItems = sqliteTable('fee_items', {
  id: text('id').primaryKey(),
  classId: text('class_id')
    .notNull()
    .references(() => classes.id),
  title: text('title').notNull(),
  amount: real('amount').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const feeCharges = sqliteTable(
  'fee_charges',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => feeItems.id),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    amount: real('amount').notNull(),
    paid: real('paid').notNull().default(0),
    note: text('note').notNull().default(''),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('fee_charges_student_idx').on(t.studentId), uniqueIndex('fee_charges_item_student_unique').on(t.itemId, t.studentId)],
)

export const studentAvatars = sqliteTable('student_avatars', {
  studentId: text('student_id')
    .primaryKey()
    .references(() => students.id),
  nickname: text('nickname').notNull().default(''),
  config: text('config', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** ไฟล์ใน R2 ที่ระบบรู้ขนาด (ใช้คิดพื้นที่ต่องาน) */
export const storedFiles = sqliteTable('stored_files', {
  key: text('key').primaryKey(),
  size: integer('size').notNull(),
  createdAt: integer('created_at').notNull(),
})

/** ยอดรวมพื้นที่ (แถวเดียว id='main') — อัปเดตทุกครั้งที่อัปโหลด/ลบ ไม่ต้องรวมทั้งตารางทุกครั้ง */
export const storageStats = sqliteTable('storage_stats', {
  id: text('id').primaryKey(),
  bytes: integer('bytes').notNull().default(0),
  files: integer('files').notNull().default(0),
  syncedAt: integer('synced_at'),
})
