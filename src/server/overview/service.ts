import { sql } from "drizzle-orm";
import { todayBangkok } from "../../shared/attendance";
import { CATEGORY_LABEL } from "../../shared/scores";
import {
  OVERVIEW_ITEMS_PER_CLASS,
  type Overview,
  type OverviewClass,
  type OverviewItem,
  type OverviewKind,
} from "../../shared/overview";
import { allClassGrades } from "../grades/service";
import type { Db } from "../db/client";
import { termWindow } from "../terms/service";

const dateFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
});
const fmt = (t: number) => dateFmt.format(t);
const fmtDate = (d: string) => dateFmt.format(new Date(`${d}T12:00:00+07:00`));
const baht = (n: number) => `฿${Math.round(n).toLocaleString("th-TH")}`;

type Row = { classId: string } & Record<string, unknown>;

/** จัดแถว (เรียงมาแล้ว) เป็นรายการต่อห้อง · เกินโควตาบอกเป็นจำนวนที่เหลือ */
function byClass<R extends Row>(
  rows: R[],
  toItem: (r: R) => OverviewItem,
): Map<string, { items: OverviewItem[]; more: number }> {
  const out = new Map<string, { items: OverviewItem[]; more: number }>();
  for (const r of rows) {
    const c =
      out.get(r.classId) ??
      out.set(r.classId, { items: [], more: 0 }).get(r.classId)!;
    if (c.items.length < OVERVIEW_ITEMS_PER_CLASS) c.items.push(toItem(r));
    else c.more++;
  }
  return out;
}

/** ภาพรวมทุกห้อง (ใช้คำสั่งรวมไม่กี่คำสั่ง ไม่วนทีละห้อง — D1 จำกัด 50 คำสั่งต่อคำขอ) */
export async function overview(
  db: Db,
  kind: OverviewKind,
  t: number,
): Promise<Overview> {
  const w = await termWindow(db);
  const classes = await db.all<{ classId: string; n: number }>(sql`
    SELECT c.id AS classId, (SELECT count(*) FROM students s WHERE s.class_id = c.id AND s.active = 1) AS n FROM classes c WHERE c.archived = 0`);
  const size = new Map(classes.map((c) => [c.classId, c.n]));
  let lists = new Map<string, { items: OverviewItem[]; more: number }>();
  const stats = new Map<string, string>();

  switch (kind) {
    case "gradebook":
    case "new-assignment": {
      const rows = await db.all<
        Row & {
          title: string;
          dueAt: number | null;
          sent: number;
          toGrade: number;
          published: number;
          publishAt: number | null;
        }
      >(sql`
        SELECT a.class_id AS classId, a.title, a.due_at AS dueAt, a.published, a.publish_at AS publishAt,
          (SELECT count(*) FROM submissions s WHERE s.assignment_id = a.id AND s.status != 'returned') AS sent,
          (SELECT count(*) FROM submissions s WHERE s.assignment_id = a.id AND s.status IN ('submitted', 'late')) AS toGrade
        FROM assignments a WHERE a.created_at >= ${w.start} AND a.created_at < ${w.end} ORDER BY a.created_at DESC`);
      lists = byClass(rows, (r) =>
        !r.published
          ? {
              title: r.title,
              meta: r.publishAt
                ? `⏰ เผยแพร่ ${fmt(r.publishAt)}`
                : "ร่าง · ยังไม่เผยแพร่",
              tone: "purple",
            }
          : {
              title: r.title,
              meta: `${r.dueAt ? `ส่ง ${fmt(r.dueAt)} · ` : ""}ส่งแล้ว ${r.sent}/${size.get(r.classId) ?? 0}${r.toGrade ? ` · รอตรวจ ${r.toGrade}` : ""}`,
              tone: r.toGrade
                ? "amber"
                : r.dueAt !== null &&
                    r.dueAt < t &&
                    r.sent < (size.get(r.classId) ?? 0)
                  ? "red"
                  : "green",
            },
      );
      for (const [id, l] of lists)
        stats.set(id, `งานเทอมนี้ ${l.items.length + l.more} ชิ้น`);
      break;
    }
    case "attendance": {
      const rows = await db.all<
        Row & { date: string; present: number; total: number }
      >(sql`
        SELECT d.class_id AS classId, d.date, sum(r.status IN ('present', 'late')) AS present, count(r.id) AS total
        FROM attendance_days d LEFT JOIN attendance_records r ON r.day_id = d.id
        WHERE d.date >= ${todayBangkok(w.start)} GROUP BY d.id ORDER BY d.date DESC`);
      lists = byClass(rows, (r) => ({
        title: fmtDate(r.date),
        meta: `มา ${r.present}/${r.total} คน`,
        tone: r.total && r.present / r.total < 0.8 ? "amber" : "green",
      }));
      for (const [id, l] of lists)
        stats.set(id, `เช็กชื่อแล้ว ${l.items.length + l.more} คาบ`);
      break;
    }
    case "seating":
    case "analysis":
    case "insights": {
      const rows = await db.all<{
        classId: string;
        avg: number;
        top: number;
      }>(sql`
        SELECT s.class_id AS classId, avg(coalesce(e.exp, 0)) AS avg, max(coalesce(e.exp, 0)) AS top FROM students s
        LEFT JOIN (SELECT student_id, sum(delta) AS exp FROM point_events WHERE created_at >= ${w.start} AND created_at < ${w.end} GROUP BY student_id) e ON e.student_id = s.id
        WHERE s.active = 1 GROUP BY s.class_id`);
      for (const r of rows)
        stats.set(
          r.classId,
          `${size.get(r.classId) ?? 0} คน · EXP เฉลี่ย ${Math.round(r.avg)} · สูงสุด ${r.top}`,
        );
      break;
    }
    case "scores": {
      const rows = await db.all<
        Row & {
          title: string;
          category: string;
          takenOn: string;
          published: number;
          entered: number;
        }
      >(sql`
        SELECT i.class_id AS classId, i.title, i.category, i.taken_on AS takenOn, i.published,
          (SELECT count(*) FROM scores sc WHERE sc.item_id = i.id AND (sc.score IS NOT NULL OR sc.absent = 1)) AS entered
        FROM score_items i WHERE i.created_at >= ${w.start} AND i.created_at < ${w.end} ORDER BY i.taken_on DESC, i.created_at DESC`);
      lists = byClass(rows, (r) => ({
        title: r.title,
        meta: `${CATEGORY_LABEL[r.category as keyof typeof CATEGORY_LABEL] ?? ""} · ${fmtDate(r.takenOn)} · กรอกแล้ว ${r.entered}/${size.get(r.classId) ?? 0}${r.published ? " · เผยแพร่แล้ว" : ""}`,
        tone: r.published ? "green" : "gray",
      }));
      break;
    }
    case "grades": {
      const all = await allClassGrades(db);
      for (const [classId, m] of all) {
        const dist = new Map<string, number>();
        for (const g of m.values())
          if (g !== null) dist.set(g, (dist.get(g) ?? 0) + 1);
        stats.set(
          classId,
          dist.size
            ? [...dist]
                .sort(
                  (a, b) =>
                    Number(b[0]) - Number(a[0]) || b[0].localeCompare(a[0]),
                )
                .map(([g, n]) => `เกรด ${g}: ${n}`)
                .join(" · ")
            : "ยังไม่มีคะแนน",
        );
      }
      break;
    }
    case "calendar": {
      const rows = await db.all<
        Row & { title: string; date: string; kind: string }
      >(sql`
        SELECT class_id AS classId, title, date, kind FROM calendar_events WHERE date >= ${todayBangkok(t)} ORDER BY date`);
      const KIND: Record<string, string> = {
        exam: "📝 สอบ",
        activity: "🎉 กิจกรรม",
        holiday: "🏖️ หยุด",
      };
      lists = byClass(rows, (r) => ({
        title: r.title,
        meta: `${KIND[r.kind] ?? ""} · ${fmtDate(r.date)}`,
        tone: r.kind === "exam" ? "red" : "blue",
      }));
      break;
    }
    case "card-game": {
      const rows = await db.all<
        Row & {
          title: string;
          createdAt: number;
          endedAt: number | null;
          answers: number;
        }
      >(sql`
        SELECT g.class_id AS classId, coalesce(q.title, 'เกมการ์ด') AS title, g.created_at AS createdAt, g.ended_at AS endedAt,
          (SELECT count(*) FROM card_answers ca WHERE ca.game_id = g.id) AS answers
        FROM card_games g LEFT JOIN card_quizzes q ON q.id = g.quiz_id ORDER BY g.created_at DESC`);
      lists = byClass(rows, (r) => ({
        title: r.title,
        meta: `${fmt(r.createdAt)} · ${r.endedAt ? "จบแล้ว" : "กำลังเล่น"} · คำตอบ ${r.answers}`,
        tone: r.endedAt ? "gray" : "amber",
      }));
      break;
    }
    case "report-cards": {
      const rows = await db.all<{ key: string; value: string }>(
        sql`SELECT key, value FROM settings WHERE key LIKE ${`report:%:${w.term.id}`}`,
      );
      for (const r of rows) {
        const classId = r.key.slice("report:".length, -(w.term.id.length + 1));
        let released = false;
        try {
          released = !!JSON.parse(r.value).released;
        } catch {}
        stats.set(
          classId,
          released
            ? `✅ เปิดให้นักเรียนดูใบสรุปผลเทอม ${w.term.name} แล้ว`
            : `ยังไม่เปิดใบสรุปผลเทอม ${w.term.name}`,
        );
      }
      for (const c of classes)
        if (!stats.has(c.classId))
          stats.set(c.classId, `ยังไม่เปิดใบสรุปผลเทอม ${w.term.name}`);
      break;
    }
    case "videos": {
      const rows = await db.all<
        Row & {
          title: string;
          createdAt: number;
          published: number;
          nq: number;
          watched: number;
        }
      >(sql`
        SELECT v.class_id AS classId, v.title, v.created_at AS createdAt, v.published, json_array_length(v.questions) AS nq,
          (SELECT count(*) FROM point_events p WHERE p.source = 'video' AND p.ref_id LIKE v.id || ':%') AS watched
        FROM videos v ORDER BY v.created_at DESC`);
      lists = byClass(rows, (r) => ({
        title: r.title,
        meta: `${fmt(r.createdAt)} · ดูครบ ${r.watched}/${size.get(r.classId) ?? 0}${r.nq ? ` · คำถาม ${r.nq} ข้อ` : ""}${r.published ? "" : " · ซ่อนอยู่"}`,
        tone: r.published ? "green" : "gray",
      }));
      for (const [id, l] of lists)
        stats.set(id, `${l.items.length + l.more} คลิป`);
      break;
    }
    case "announcements": {
      const rows = await db.all<
        Row & {
          title: string;
          createdAt: number;
          pinned: number;
          expiresOn: string | null;
        }
      >(sql`
        SELECT class_id AS classId, title, created_at AS createdAt, pinned, expires_on AS expiresOn FROM announcements ORDER BY pinned DESC, created_at DESC`);
      const today = todayBangkok(t);
      lists = byClass(rows, (r) => {
        const expired = r.expiresOn !== null && r.expiresOn < today;
        return {
          title: `${r.pinned ? "📌 " : ""}${r.title}`,
          meta: `${fmt(r.createdAt)}${expired ? " · หมดอายุแล้ว" : r.expiresOn ? ` · ถึง ${fmtDate(r.expiresOn)}` : ""}`,
          tone: expired ? "gray" : "green",
        };
      });
      break;
    }
    case "materials": {
      const rows = await db.all<
        Row & {
          title: string;
          kind: string;
          topic: string;
          lessonDate: string;
          published: number;
          createdAt: number;
        }
      >(sql`
        SELECT class_id AS classId, title, kind, topic, lesson_date AS lessonDate, published, created_at AS createdAt FROM materials ORDER BY created_at DESC`);
      lists = byClass(rows, (r) => ({
        title: `${r.kind === "notes" ? "📒" : "📄"} ${r.title}`,
        meta: [
          r.kind === "notes"
            ? `จดในห้อง${r.lessonDate ? ` ${fmtDate(r.lessonDate)}` : ""}`
            : "เอกสารเปล่า",
          r.topic,
          r.published ? "" : "ซ่อนอยู่",
        ]
          .filter(Boolean)
          .join(" · "),
        tone: r.published ? (r.kind === "notes" ? "amber" : "green") : "gray",
      }));
      for (const [id, l] of lists)
        stats.set(id, `${l.items.length + l.more} ไฟล์`);
      break;
    }
    case "fees": {
      const rows = await db.all<
        Row & {
          title: string;
          amount: number;
          charged: number;
          paidN: number;
          owed: number;
        }
      >(sql`
        SELECT f.class_id AS classId, f.title, f.amount,
          (SELECT count(*) FROM fee_charges c WHERE c.item_id = f.id) AS charged,
          (SELECT count(*) FROM fee_charges c WHERE c.item_id = f.id AND c.paid >= c.amount) AS paidN,
          (SELECT coalesce(sum(max(c.amount - c.paid, 0)), 0) FROM fee_charges c WHERE c.item_id = f.id) AS owed
        FROM fee_items f ORDER BY f.created_at DESC`);
      lists = byClass(rows, (r) => ({
        title: `${r.title} (${baht(r.amount)})`,
        meta: `จ่ายครบ ${r.paidN}/${r.charged} คน${r.owed > 0 ? ` · ค้าง ${baht(r.owed)}` : ""}`,
        tone: r.owed > 0 ? "amber" : "green",
      }));
      const owed = new Map<string, number>();
      for (const r of rows)
        owed.set(r.classId, (owed.get(r.classId) ?? 0) + r.owed);
      for (const [id, n] of owed)
        stats.set(id, n > 0 ? `ค้างรวม ${baht(n)}` : "จ่ายครบทุกรายการ");
      break;
    }
  }

  const out: OverviewClass[] = classes.map((c) => ({
    classId: c.classId,
    stat: stats.get(c.classId) ?? null,
    items: lists.get(c.classId)?.items ?? [],
    more: lists.get(c.classId)?.more ?? 0,
  }));
  return { kind, classes: out };
}
