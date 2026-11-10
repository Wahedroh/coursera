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
  expReward: integer('exp_reward').notNull().default(30),
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
    /** นักเรียนส่งเป็นกระดาษกับครู ครูบันทึกเอง (ไม่มีข้อความ/รูปในระบบ) */
    onPaper: integer('on_paper', { mode: 'boolean' }).notNull().default(false),
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
    source: text('source', { enum: ['manual', 'assignment', 'attendance', 'live', 'video', 'quest'] }).notNull(),
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
    /** ไข่ของเทอมไหน (เลเวลนับใหม่ทุกเทอม) — ตัวละครที่สุ่มได้มาจากซีซันของเทอมนั้น */
    termId: text('term_id').notNull().default('term-1'),
    level: integer('level').notNull(),
    characterId: text('character_id'),
    openedAt: integer('opened_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('eggs_student_term_level_unique').on(t.studentId, t.termId, t.level)],
)

/** ภาคเรียน — เทอมปัจจุบัน = แถวที่ started_at ล่าสุด · ข้อมูลของเทอม = สิ่งที่สร้างในช่วง [started_at, เทอมถัดไป) */
export const terms = sqliteTable('terms', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  startedAt: integer('started_at').notNull(),
  /** ชุดตัวละครที่ไข่ของเทอมนี้สุ่มออกมา */
  season: integer('season').notNull(),
  createdAt: integer('created_at').notNull(),
})

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
  /** คำถามท้ายคลิป (ต้องตอบถูกทุกข้อจึงได้ EXP) */
  questions: text('questions', { mode: 'json' }).$type<{ q: string; choices: string[]; answer: number }[]>().notNull().default(sql`'[]'`),
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

/** อุปกรณ์ของนักเรียนที่เปิดรับการแจ้งเตือน (Web Push) */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: text('id').primaryKey(),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    endpoint: text('endpoint').notNull().unique(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('push_subscriptions_student_idx').on(t.studentId)],
)

/** การแจ้งเตือนถึงนักเรียน — ส่ง push เปล่า (ไม่มีข้อมูลในตัว) แล้ว service worker มาดึงข้อความจากตารางนี้ */
export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    url: text('url').notNull().default('/me'),
    /** กันแจ้งซ้ำ เช่น due:<งาน>:<นักเรียน> */
    dedupeKey: text('dedupe_key').unique(),
    createdAt: integer('created_at').notNull(),
    pushedAt: integer('pushed_at'),
    shownAt: integer('shown_at'),
    /** นักเรียนเปิดดูในหน้าแอปแล้ว */
    readAt: integer('read_at'),
  },
  (t) => [index('notifications_student_idx').on(t.studentId), index('notifications_pushed_idx').on(t.pushedAt)],
)

/** ปฏิทิน: วันสอบ · กิจกรรม · วันหยุด ที่ครูเพิ่มเอง (กำหนดส่งงานดึงจากตารางงานโดยตรง) */
export const calendarEvents = sqliteTable(
  'calendar_events',
  {
    id: text('id').primaryKey(),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id),
    kind: text('kind', { enum: ['exam', 'activity', 'holiday'] }).notNull(),
    title: text('title').notNull(),
    /** YYYY-MM-DD (เวลาไทย) */
    date: text('date').notNull(),
    period: text('period').notNull().default(''),
    detail: text('detail').notNull().default(''),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('calendar_events_class_date_idx').on(t.classId, t.date)],
)

/** ชุดคำถามของเกมการ์ด QR (ใช้ได้ทุกห้อง) */
export const cardQuizzes = sqliteTable('card_quizzes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  questions: text('questions', { mode: 'json' }).$type<{ q: string; choices: string[]; answer: number }[]>().notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** เกมการ์ด 1 รอบในห้องหนึ่ง */
export const cardGames = sqliteTable(
  'card_games',
  {
    id: text('id').primaryKey(),
    quizId: text('quiz_id')
      .notNull()
      .references(() => cardQuizzes.id),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id),
    /** สำเนาคำถาม ณ ตอนเริ่มเกม (แก้ชุดคำถามทีหลังไม่กระทบผล) */
    questions: text('questions', { mode: 'json' }).$type<{ q: string; choices: string[]; answer: number }[]>().notNull(),
    current: integer('current').notNull().default(0),
    revealed: integer('revealed', { mode: 'boolean' }).notNull().default(false),
    endedAt: integer('ended_at'),
    /** รายการคะแนนเก็บที่สร้างตอนจบเกม (ลบเกม = ลบรายการนี้ด้วย) */
    scoreItemId: text('score_item_id'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('card_games_class_idx').on(t.classId)],
)

/** คำตอบที่สแกนได้ (สแกนซ้ำ = ทับคำตอบเดิม จนกว่าครูกดเฉลย) */
export const cardAnswers = sqliteTable(
  'card_answers',
  {
    gameId: text('game_id')
      .notNull()
      .references(() => cardGames.id),
    qIndex: integer('q_index').notNull(),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    answer: integer('answer').notNull(),
    scannedAt: integer('scanned_at').notNull(),
  },
  (t) => [uniqueIndex('card_answers_unique').on(t.gameId, t.qIndex, t.studentId), index('card_answers_student_idx').on(t.studentId)],
)
