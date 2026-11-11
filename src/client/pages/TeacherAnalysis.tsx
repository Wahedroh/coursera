import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../api";
import {
  RISK_LABEL,
  RULES,
  type ClassAnalysis,
  type RiskLevel,
  type StudentAnalysis,
} from "../../shared/analysis";
import type { Term } from "../../shared/terms";
import { Button, Card, ErrorBox, Loading } from "../ui";
import TeacherLayout from "./TeacherLayout";
import { useTeacherErrorHandler } from "./useTeacherGuard";

const PILL: Record<RiskLevel, string> = {
  urgent: "bg-red-50 text-red-700",
  watch: "bg-amber-50 text-amber-800",
  good: "bg-board-soft text-board",
};
const ARROW = { up: "↑", down: "↓", flat: "→" } as const;
const pct = (v: number | null) => (v === null ? "–" : `${v}%`);

/** กราฟเส้นคะแนนสอบของนักเรียน เทียบค่าเฉลี่ยห้อง (เส้นประ) */
function ExamChart({ exams }: { exams: StudentAnalysis["exams"] }) {
  const pts = exams.filter((e) => e.pct !== null || e.classAvg !== null);
  if (pts.length < 2) return null;
  const W = 640;
  const H = 140;
  const x = (i: number) => 30 + (i * (W - 60)) / (pts.length - 1);
  const y = (v: number) => 10 + (1 - v / 100) * (H - 40);
  const line = (key: "pct" | "classAvg") =>
    pts
      .map((e, i) => (e[key] === null ? null : `${x(i)},${y(e[key]!)}`))
      .filter(Boolean)
      .join(" ");
  return (
    <figure
      className="flex flex-col gap-1"
      aria-label="คะแนนสอบแต่ละครั้งเทียบค่าเฉลี่ยห้อง"
    >
      <figcaption className="text-xs text-stone-500">
        คะแนนสอบแต่ละครั้ง (%) · เส้นประ = ค่าเฉลี่ยห้อง
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1="30" x2={W - 30} y1={y(v)} y2={y(v)} stroke="#eee" />
            <text x="0" y={y(v) + 4} fontSize="11" fill="#999">
              {v}
            </text>
          </g>
        ))}
        <polyline
          points={line("classAvg")}
          fill="none"
          stroke="#999"
          strokeDasharray="5 5"
          strokeWidth="2"
        />
        <polyline
          points={line("pct")}
          fill="none"
          stroke="#1E8A5E"
          strokeWidth="3"
        />
        {pts.map((e, i) => (
          <g key={i}>
            {e.pct !== null && (
              <circle
                cx={x(i)}
                cy={y(e.pct)}
                r="5"
                fill={
                  e.classAvg !== null && e.pct < e.classAvg - 10
                    ? "#E53935"
                    : "#1E8A5E"
                }
              >
                <title>
                  {e.title}: {e.pct}% (ห้อง {e.classAvg ?? "–"}%)
                </title>
              </circle>
            )}
            <text
              x={x(i)}
              y={H - 6}
              fontSize="11"
              fill="#666"
              textAnchor="middle"
            >
              {e.title.length > 14 ? `${e.title.slice(0, 13)}…` : e.title}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

function Detail({
  s,
  termId,
  onSaved,
  onError,
}: {
  s: StudentAnalysis;
  termId: string;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const [note, setNote] = useState(s.note);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setNote(s.note);
    setSaved(false);
  }, [s]);
  const save = async () => {
    try {
      await api(`/api/teacher/students/${s.id}/note`, {
        method: "PUT",
        body: { note, termId },
      });
      setSaved(true);
      onSaved();
    } catch (e) {
      onError(e);
    }
  };
  const sec = (title: string, items: string[], cls: string) =>
    items.length > 0 && (
      <section className={`rounded-xl border-l-4 px-3 py-2 ${cls}`}>
        <b>{title}</b>
        <ul className="list-disc pl-5 text-sm">
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </section>
    );
  return (
    <div data-testid="student-detail">
      <Card className="p-4 flex flex-col gap-3 print:border-0">
        <div className="flex justify-between items-baseline gap-2">
          <h2 className="text-xl font-extrabold">
            {s.name}{" "}
            <span className="text-sm font-normal text-stone-500">
              ({s.zipgradeId})
            </span>
          </h2>
          <span
            className={`rounded-full px-3 py-0.5 text-sm font-bold ${PILL[s.level]}`}
          >
            {RISK_LABEL[s.level]}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div className="rounded-xl bg-stone-50 p-2">
            มาเรียน<b className="block text-2xl">{pct(s.attendancePct)}</b>ขาด{" "}
            {s.absent} · สาย {s.late}
          </div>
          <div className="rounded-xl bg-stone-50 p-2">
            ส่งงาน
            <b className="block text-2xl">
              {s.done}/{s.due}
            </b>
            ค้าง {s.missing}
          </div>
          <div className="rounded-xl bg-stone-50 p-2">
            คะแนนสอบ
            <b className="block text-2xl">
              {pct(s.examAvg)} {s.trend && ARROW[s.trend]}
            </b>
            ห้องเฉลี่ย {pct(s.classExamAvg)}
          </div>
          <div className="rounded-xl bg-stone-50 p-2">
            เกรดคาดการณ์<b className="block text-2xl">{s.grade ?? "–"}</b>
            {s.rank ? `อันดับ ${s.rank}` : ""}
          </div>
        </div>
        <ExamChart exams={s.exams} />
        {sec("⚠️ ประเด็นที่พบ", s.issues, "border-red-600 bg-red-50/60")}
        {sec("🎯 ครูควรเน้น", s.focus, "border-amber-500 bg-amber-50/70")}
        {sec("✅ จุดแข็ง", s.strengths, "border-green-700 bg-board-soft/60")}
        <p className="text-xs text-stone-500">
          ทบทวนคลิป {s.videos.watched}/{s.videos.total} · เกมการ์ดตอบถูก{" "}
          {pct(s.cardsPct)}
        </p>
        <label className="text-sm font-semibold flex flex-col gap-1">
          📝 โน้ตของครู (ใช้เป็น "ความเห็นครู" ในใบสรุปผล)
          <textarea
            className="border-2 border-line rounded-xl px-3 py-2 font-normal"
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => (setNote(e.target.value), setSaved(false))}
          />
        </label>
        <div className="no-print flex gap-2 items-center">
          <Button type="button" onClick={() => void save()}>
            บันทึกโน้ต
          </Button>
          {saved && (
            <span className="text-sm text-board font-semibold">
              ✓ บันทึกแล้ว
            </span>
          )}
          <button
            type="button"
            className="ml-auto rounded-xl border-2 border-line bg-white px-3 py-2 font-bold"
            onClick={() => window.print()}
          >
            🖨️ พิมพ์รายงานรายคน
          </button>
        </div>
      </Card>
    </div>
  );
}

/** วิเคราะห์นักเรียนรายคน (ก่อนปิดเทอม): เรียงคนที่ต้องดูแลก่อน · ประเด็น · สิ่งที่ครูควรเน้น · จุดแข็ง */
export default function TeacherAnalysis() {
  const { id = "" } = useParams();
  const handle = useTeacherErrorHandler();
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [data, setData] = useState<ClassAnalysis | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<RiskLevel | "">("");
  const [error, setError] = useState<string | null>(null);
  const onError = useCallback((e: unknown) => setError(handle(e)), [handle]);

  const load = useCallback(() => {
    api<ClassAnalysis>(
      `/api/teacher/classes/${id}/analysis${termId ? `?term=${termId}` : ""}`,
    )
      .then(setData)
      .catch(onError);
  }, [id, termId, onError]);
  useEffect(load, [load]);
  useEffect(() => {
    api<Term[]>("/api/teacher/terms")
      .then(setTerms)
      .catch(() => {});
  }, []);

  const selected = data?.students.find((s) => s.id === sel) ?? null;
  const rows =
    data?.students.filter((s) => !filter || s.level === filter) ?? [];
  return (
    <TeacherLayout>
      <div className="no-print flex flex-col gap-3">
        <Link to={`/teacher/classes/${id}`} className="text-sm text-stone-500">
          ← หน้าห้อง
        </Link>
        <div className="flex flex-wrap justify-between items-end gap-2">
          <div>
            <h1 className="text-2xl font-extrabold">
              📋 วิเคราะห์นักเรียนรายคน
            </h1>
            {data && (
              <p className="text-sm text-stone-500">
                {data.class.name} · เทอม {data.term.name} ·{" "}
                {data.students.length} คน
              </p>
            )}
          </div>
          <div className="flex gap-2 items-center">
            {terms.length > 1 && (
              <select
                aria-label="เทอม"
                className="border-2 border-line rounded-xl px-3 py-1.5 bg-white font-semibold"
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
              >
                {terms.map((t, i) => (
                  <option key={t.id} value={i === 0 ? "" : t.id}>
                    เทอม {t.name}
                  </option>
                ))}
              </select>
            )}
            <Link
              to={`/teacher/classes/${id}/report-cards`}
              className="rounded-xl border-2 border-line bg-white px-3 py-1.5 font-bold"
            >
              📄 ใบสรุปผล
            </Link>
          </div>
        </div>
        <ErrorBox message={error} />
      </div>
      {!data && !error && <Loading />}
      {data && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start">
          <Card
            className={`p-3 flex flex-col gap-2 ${selected ? "no-print" : ""}`}
          >
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="กรองระดับ"
            >
              {(["urgent", "watch", "good"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={filter === l}
                  onClick={() => setFilter(filter === l ? "" : l)}
                  className={`rounded-full px-3 py-1 text-sm font-bold ${PILL[l]} ${filter === l ? "ring-2 ring-offset-1 ring-stone-400" : ""}`}
                >
                  {RISK_LABEL[l]} {data.counts[l]}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="analysis-table">
                <thead>
                  <tr className="text-left text-xs text-stone-500">
                    <th className="p-1.5">นักเรียน</th>
                    <th className="p-1.5">สถานะ</th>
                    <th className="p-1.5">มาเรียน</th>
                    <th className="p-1.5">ส่งงาน</th>
                    <th className="p-1.5">สอบ</th>
                    <th className="p-1.5">ประเด็นหลัก</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr
                      key={s.id}
                      className={`border-t border-stone-100 cursor-pointer hover:bg-stone-50 ${sel === s.id ? "bg-amber-50" : ""}`}
                      onClick={() => setSel(s.id)}
                    >
                      <td className="p-1.5">
                        <button
                          type="button"
                          className="font-bold text-left hover:underline"
                          onClick={() => setSel(s.id)}
                        >
                          {s.name.split(" ")[0]}
                        </button>{" "}
                        <span className="text-xs text-stone-500">
                          ({s.zipgradeId})
                        </span>
                      </td>
                      <td className="p-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${PILL[s.level]}`}
                        >
                          {RISK_LABEL[s.level]}
                        </span>
                      </td>
                      <td className="p-1.5 tabular-nums">
                        {pct(s.attendancePct)}
                      </td>
                      <td className="p-1.5 tabular-nums whitespace-nowrap">
                        {s.done}/{s.due}
                      </td>
                      <td className="p-1.5 tabular-nums whitespace-nowrap">
                        {pct(s.examAvg)} {s.trend && ARROW[s.trend]}
                      </td>
                      <td className="p-1.5 text-xs text-stone-600">
                        {s.headline}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="text-xs text-stone-500">
              <summary className="cursor-pointer">เกณฑ์ที่ใช้</summary>
              🔴 ด่วน: มาเรียน &lt; {RULES.urgent.attendancePct}% · งานค้าง ≥{" "}
              {RULES.urgent.missing} · คะแนนสอบเฉลี่ย &lt;{" "}
              {RULES.urgent.examPct}% · เกรดคาดการณ์ ≤ {RULES.urgent.grade}
              <br />
              🟡 เฝ้าระวัง: มาเรียน &lt; {RULES.watch.attendancePct}% · ส่งช้า ≥{" "}
              {RULES.watch.late} · งานค้าง ≥ {RULES.watch.missing} ·
              คะแนนลดต่อเนื่อง ≥ {RULES.watch.declining} ครั้ง · ขาดสอบ
              <br />
              คำนวณจากข้อมูลในระบบเท่านั้น ไม่ส่งข้อมูลนักเรียนออกไปที่อื่น
            </details>
          </Card>
          {selected ? (
            <Detail
              s={selected}
              termId={data.term.id}
              onSaved={load}
              onError={onError}
            />
          ) : (
            <Card className="p-6 text-center text-sm text-stone-500 no-print">
              แตะชื่อนักเรียนเพื่อดูการวิเคราะห์รายคน
            </Card>
          )}
        </div>
      )}
    </TeacherLayout>
  );
}
