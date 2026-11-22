import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const schools = sqliteTable('schools', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  /** ลิงก์แผนที่ที่ครูวาง (Google/Apple Maps) และพิกัดที่อ่านได้ — ใช้นำทาง */
  mapUrl: text('map_url'),
  lat: real('lat'),
  lng: real('lng'),
  /** นับคาบของโรงเรียนนี้ในภาระสอน / นับการเดินทางไปโรงเรียนนี้ */
  countPeriods: integer('count_periods', { mode: 'boolean' }).notNull().default(true),
  countTrips: integer('count_trips', { mode: 'boolean' }).notNull().default(true),
  /** แจ้งเตือนนำทางไปโรงเรียนนี้ก่อนเริ่มสอนกี่นาที (null = ไม่เตือน) */
  navLeadMinutes: integer('nav_lead_minutes').default(60),
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
  /** วันที่เก็บถาวร (YYYY-MM-DD) — ยอดคาบ/การเดินทางก่อนวันนี้ยังนับห้องนี้ */
  archivedOn: text('archived_on'),
  /** เป้าคาบสอนต่อสัปดาห์ (null = ยังไม่ตั้ง) */
  weeklyPeriods: integer('weekly_periods'),
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
  /** ตั้งเวลาเผยแพร่: published = false จนถึงเวลานี้ แล้วระบบเปิดให้เอง (null = ไม่ได้ตั้งเวลา) */
  publishAt: integer('publish_at'),
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
    /** ครูนับว่าส่งตรงเวลา: เวลาส่งจริง (submitted_at ถูกเลื่อนเป็นกำหนดส่ง) · null = ไม่ได้แก้ */
    excusedFrom: integer('excused_from'),
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
    source: text('source', { enum: ['manual', 'assignment', 'attendance', 'live', 'video', 'quest', 'streak', 'wheel'] }).notNull(),
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
    /** ของแถมที่ได้ (อุปกรณ์/ชุดพิเศษ/ตัวละครลึกลับ · null = ไม่ได้) */
    bonusItem: text('bonus_item'),
    /** เวลาที่สุ่มของแถมแล้ว · ไข่ที่เปิดแล้วแต่ยังเป็น null = กล่องของขวัญรอเปิด (ไข่ที่เปิดก่อนมีของแถม) */
    bonusAt: integer('bonus_at'),
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
  /** สอบย้อนหลังได้ภายในกี่วันหลังวันสอบ (หมดแล้วคนที่ขาดสอบได้ 0) · 0 = ไม่เปิดสอบย้อนหลัง */
  makeupDays: integer('makeup_days').notNull().default(14),
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
  /** ตั้งเวลาเผยแพร่: published = false จนถึงเวลานี้ แล้วระบบเปิดให้เอง (null = ไม่ได้ตั้งเวลา) */
  publishAt: integer('publish_at'),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('videos_class_idx').on(t.classId)])

export const materials = sqliteTable('materials', {
  id: text('id').primaryKey(),
  classId: text('class_id')
    .notNull()
    .references(() => classes.id),
  title: text('title').notNull(),
  topic: text('topic').notNull().default(''),
  /** blank = เอกสารเปล่า · notes = เอกสารที่จดในห้อง (มีวันที่สอน) */
  kind: text('kind', { enum: ['blank', 'notes'] }).notNull().default('blank'),
  lessonDate: text('lesson_date').notNull().default(''),
  fileKey: text('file_key').notNull(),
  fileName: text('file_name').notNull(),
  size: integer('size').notNull(),
  published: integer('published', { mode: 'boolean' }).notNull().default(true),
  /** ตั้งเวลาเผยแพร่: published = false จนถึงเวลานี้ แล้วระบบเปิดให้เอง (null = ไม่ได้ตั้งเวลา) */
  publishAt: integer('publish_at'),
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
  published: integer('published', { mode: 'boolean' }).notNull().default(true),
  /** ตั้งเวลาเผยแพร่ (ดู assignments.publishAt) */
  publishAt: integer('publish_at'),
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
    questions: text('questions', { mode: 'json' }).$type<{ q: string; choices: string[]; answer: number; image?: string; seconds?: number }[]>().notNull(),
    current: integer('current').notNull().default(0),
    /** เวลาที่เริ่มข้อปัจจุบัน (ใช้นับถอยหลังเมื่อข้อนั้นตั้งเวลาไว้) */
    questionStartedAt: integer('question_started_at'),
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
    /** ที่มาของคำตอบ: ครูสแกนการ์ด หรือ นักเรียนกดในเครื่องตัวเอง (คำตอบจากเครื่องไม่ถูกการสแกนทับ) */
    via: text('via').$type<'card' | 'device'>().notNull().default('card'),
  },
  (t) => [uniqueIndex('card_answers_unique').on(t.gameId, t.qIndex, t.studentId), index('card_answers_student_idx').on(t.studentId)],
)

/** โน้ตของครูต่อนักเรียนรายเทอม (ใช้เป็น "ความเห็นครู" ในใบสรุปผล) */
export const studentNotes = sqliteTable(
  'student_notes',
  {
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    termId: text('term_id').notNull(),
    note: text('note').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('student_notes_unique').on(t.studentId, t.termId)],
)

/** ตารางสอนของครู: คาบประจำสัปดาห์ (เวลาไทย) */
export const timetableSlots = sqliteTable(
  'timetable_slots',
  {
    id: text('id').primaryKey(),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id),
    /** 1 = จันทร์ … 7 = อาทิตย์ */
    weekday: integer('weekday').notNull(),
    /** HH:MM */
    start: text('start').notNull(),
    end: text('end').notNull(),
    /** จำนวนคาบในช่วงนี้ (null = คิดจากความยาว ช่วงละ 50 นาที) */
    periods: integer('periods'),
    /** ช่วงที่ใช้คาบนี้ (YYYY-MM-DD รวมทั้งสองวัน · null = ไม่จำกัด) — เปลี่ยนตารางกลางเทอมแล้วยอดย้อนหลังไม่เพี้ยน */
    validFrom: text('valid_from'),
    validTo: text('valid_to'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('timetable_class_idx').on(t.classId)],
)

/** เครื่องของครูที่เปิดรับแจ้งเตือน (ครูมีคนเดียว จึงไม่ผูกกับผู้ใช้) */
export const teacherPushSubscriptions = sqliteTable('teacher_push_subscriptions', {
  id: text('id').primaryKey(),
  endpoint: text('endpoint').notNull().unique(),
  createdAt: integer('created_at').notNull(),
})

/** แจ้งเตือนของครู (ก่อนเข้าคาบ · ลืมเช็กชื่อ · งานรอตรวจ · ส่งแก้ · ครบกำหนด · เผยแพร่ · ยืนยันการสอน) */
export const teacherNotifications = sqliteTable(
  'teacher_notifications',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    url: text('url').notNull().default('/teacher'),
    /** ส่งครั้งเดียวต่อเรื่อง */
    dedupeKey: text('dedupe_key').unique(),
    /** รวมหลายเหตุการณ์เป็นรายการเดียว (เช่น ส่งแก้แล้ว N คน) */
    count: integer('count').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    pushedAt: integer('pushed_at'),
    shownAt: integer('shown_at'),
    readAt: integer('read_at'),
  },
  (t) => [index('teacher_notifications_created_idx').on(t.createdAt)],
)

/** โรงเรียนปิด/งดสอน (schoolId = null คือปิดทุกโรงเรียน) — ไม่นับคาบ/การเดินทาง ไม่เตือน ไม่นำทาง */
export const schoolClosures = sqliteTable(
  'school_closures',
  {
    id: text('id').primaryKey(),
    schoolId: text('school_id').references(() => schools.id),
    fromDate: text('from_date').notNull(),
    toDate: text('to_date').notNull(),
    reason: text('reason').notNull(),
    note: text('note').notNull().default(''),
    /** ประกาศ "งดเรียน" ที่สร้างให้นักเรียน (ลบการปิด = ลบประกาศ) */
    announcementIds: text('announcement_ids', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    /** ต้องสอนชดเชยไหม (วันหยุดราชการ = ไม่ต้อง โดยปริยาย) */
    makeupNeeded: integer('makeup_needed', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('school_closures_dates_idx').on(t.fromDate, t.toDate)],
)

/** นัด/สถานที่พิเศษรายวันของครู (นับการเดินทาง และนำทางได้) */
export const teacherAppointments = sqliteTable(
  'teacher_appointments',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull(),
    start: text('start').notNull(),
    title: text('title').notNull(),
    mapUrl: text('map_url'),
    lat: real('lat'),
    lng: real('lng'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('teacher_appointments_date_idx').on(t.date)],
)

/** คาบสอนชดเชย (แทนคาบที่โรงเรียนปิด) — ที่โรงเรียน (นับการเดินทาง) หรือออนไลน์ Google Meet (ไม่นับการเดินทาง) */
export const makeupClasses = sqliteTable(
  'makeup_classes',
  {
    id: text('id').primaryKey(),
    closureId: text('closure_id').references(() => schoolClosures.id),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id),
    date: text('date').notNull(),
    start: text('start').notNull(),
    end: text('end').notNull(),
    periods: integer('periods'),
    mode: text('mode').$type<'onsite' | 'online'>().notNull(),
    meetUrl: text('meet_url'),
    /** แทนคาบของวันที่ (ไม่ผูกกับวันปิดโรงเรียนก็ได้) และหมายเหตุ */
    forDate: text('for_date'),
    note: text('note').notNull().default(''),
    announcementId: text('announcement_id'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('makeup_classes_date_idx').on(t.date), index('makeup_classes_closure_idx').on(t.closureId)],
)

/** ความคืบหน้าการดูคลิปของนักเรียน (เปอร์เซ็นต์สูงสุดที่เคยดู) — ครูเห็นรายชื่อคนที่ดูแล้ว */
export const videoProgress = sqliteTable(
  'video_progress',
  {
    videoId: text('video_id')
      .notNull()
      .references(() => videos.id),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    percent: integer('percent').notNull(),
    watchedSeconds: integer('watched_seconds').notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    /** คำถามท้ายคลิป: จำนวนครั้งที่ส่ง · ถูกมากสุด · ครั้งล่าสุด · คำตอบล่าสุด (ลำดับตัวเลือก) */
    quizAttempts: integer('quiz_attempts').notNull().default(0),
    quizBest: integer('quiz_best'),
    quizLast: integer('quiz_last'),
    quizAnswers: text('quiz_answers', { mode: 'json' }).$type<number[]>(),
    firstAt: integer('first_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('video_progress_unique').on(t.videoId, t.studentId), index('video_progress_student_idx').on(t.studentId)],
)

/** ครูบันทึกว่านักเรียน "ไม่ส่งงาน" ชิ้นนี้: ปิดรับ (ส่งไม่ได้อีก) · ไม่ได้ EXP · คะแนน 0 */
export const assignmentClosed = sqliteTable(
  'assignment_closed',
  {
    assignmentId: text('assignment_id')
      .notNull()
      .references(() => assignments.id),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('assignment_closed_unique').on(t.assignmentId, t.studentId), index('assignment_closed_student_idx').on(t.studentId)],
)

/** ใบลาของนักเรียน (ป่วย/กิจ) — ครูอนุมัติแล้ว ระบบใส่สถานะเช็กชื่อให้ (วันที่เช็กแล้วและวันที่จะเปิดเช็กภายหลัง) */
export const leaveRequests = sqliteTable(
  'leave_requests',
  {
    id: text('id').primaryKey(),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id),
    kind: text('kind', { enum: ['sick', 'leave'] }).notNull(),
    fromDate: text('from_date').notNull(),
    toDate: text('to_date').notNull(),
    reason: text('reason').notNull().default(''),
    imageKey: text('image_key'),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
    teacherNote: text('teacher_note').notNull().default(''),
    decidedAt: integer('decided_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('leave_requests_student_idx').on(t.studentId), index('leave_requests_class_idx').on(t.classId, t.status)],
)

/** งานซ่อมเฉพาะคน (ติด 0 / ร / มส) — ไม่อยู่ในสมุดคะแนนหลัก · ครูตรวจแล้วกด "ผ่าน" พร้อมผลหลังซ่อม */
export const remedials = sqliteTable(
  'remedials',
  {
    id: text('id').primaryKey(),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    reason: text('reason', { enum: ['zero', 'incomplete', 'attendance'] }).notNull(),
    title: text('title').notNull(),
    instructions: text('instructions').notNull().default(''),
    dueAt: integer('due_at'),
    status: text('status', { enum: ['assigned', 'submitted', 'returned', 'passed'] }).notNull().default('assigned'),
    text: text('text').notNull().default(''),
    imageKeys: text('image_keys', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    submittedAt: integer('submitted_at'),
    comment: text('comment').notNull().default(''),
    /** ผลหลังซ่อม เช่น "1" (0 → 1) หรือเกรดที่ได้หลังแก้ ร/มส */
    resultGrade: text('result_grade'),
    decidedAt: integer('decided_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('remedials_class_idx').on(t.classId), index('remedials_student_idx').on(t.studentId)],
)

/** ชุดข้อสอบปรนัย (สอบย้อนหลังออนไลน์): พิมพ์ในระบบ (สลับข้อได้) หรือรูปหน้าข้อสอบ + เฉลย */
export const examSets = sqliteTable('exam_sets', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  kind: text('kind', { enum: ['typed', 'pages'] }).notNull(),
  /** typed: [{ q, image?, choices, answer }] */
  questions: text('questions', { mode: 'json' }).$type<{ q: string; image?: string; choices: string[]; answer: number }[]>().notNull().default(sql`'[]'`),
  /** pages: รูปหน้าข้อสอบ (แปลงจาก PDF) · เฉลยต่อข้อ · จำนวนตัวเลือก */
  pageKeys: text('page_keys', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  answers: text('answers', { mode: 'json' }).$type<number[]>().notNull().default(sql`'[]'`),
  choiceCount: integer('choice_count').notNull().default(4),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** คำขอ/การสอบย้อนหลังของนักเรียน 1 คน 1 รายการสอบ */
export const makeupExams = sqliteTable(
  'makeup_exams',
  {
    id: text('id').primaryKey(),
    scoreItemId: text('score_item_id')
      .notNull()
      .references(() => scoreItems.id),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id),
    reason: text('reason').notNull().default(''),
    imageKey: text('image_key'),
    status: text('status', { enum: ['pending', 'approved', 'rejected', 'in_progress', 'submitted', 'graded', 'expired'] }).notNull().default('pending'),
    mode: text('mode', { enum: ['online', 'paper'] }),
    opensAt: integer('opens_at'),
    closesAt: integer('closes_at'),
    durationMin: integer('duration_min'),
    /** เพดานคะแนน (% ของคะแนนเต็ม) */
    capPct: integer('cap_pct').notNull().default(100),
    examSetId: text('exam_set_id').references(() => examSets.id),
    /** รหัสเริ่มสอบ (ครูบอกนักเรียน · ไม่ส่งให้นักเรียนทางระบบ) */
    code: text('code'),
    /** สลับข้อ/ตัวเลือก (ข้อสอบที่พิมพ์ในระบบ) */
    seed: integer('seed'),
    deviceId: text('device_id'),
    startedAt: integer('started_at'),
    submittedAt: integer('submitted_at'),
    /** คำตอบตามลำดับข้อของชุดต้นฉบับ (-1 = ไม่ตอบ) */
    answers: text('answers', { mode: 'json' }).$type<number[]>().notNull().default(sql`'[]'`),
    leaves: integer('leaves').notNull().default(0),
    autoScore: real('auto_score'),
    finalScore: real('final_score'),
    teacherNote: text('teacher_note').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('makeup_exams_student_idx').on(t.studentId), index('makeup_exams_item_idx').on(t.scoreItemId), index('makeup_exams_status_idx').on(t.status)],
)

/** บันทึกระหว่างสอบย้อนหลัง (เริ่ม · ออกจากหน้าจอ · เครื่องอื่น · ส่ง) */
export const makeupEvents = sqliteTable(
  'makeup_events',
  {
    id: text('id').primaryKey(),
    examId: text('exam_id')
      .notNull()
      .references(() => makeupExams.id),
    at: integer('at').notNull(),
    kind: text('kind', { enum: ['start', 'leave', 'return', 'device', 'submit', 'auto-submit', 'timeout'] }).notNull(),
    /** ระยะที่ออกจากหน้าจอ (ms) */
    ms: integer('ms'),
  },
  (t) => [index('makeup_events_exam_idx').on(t.examId)],
)
