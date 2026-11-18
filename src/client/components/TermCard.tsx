import { useEffect, useState } from "react";
import { api } from "../api";
import { SEASONS } from "../../shared/characters";
import { nextTerm, seasonOfSemester, termName, type Term } from "../../shared/terms";
import { Button, Card, ErrorBox } from "../ui";
import Icon from './Icon'

/** ชื่อเทอมถัดไปแบบไทย: 1/2569 → 2/2569 · 2/2569 → 1/2570 */
export function nextTermName(name: string): string {
  const n = nextTerm(name);
  return n ? termName(n.semester, n.year) : "";
}

const todayStr = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

/** เทอมปัจจุบัน + ปุ่มขึ้นเทอม 2 (ปีเดียวกัน) · ขึ้นปีการศึกษาใหม่ใช้ขั้นตอนแยก */
export default function TermCard() {
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(todayStr());
  const [copy, setCopy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    api<Term[]>("/api/teacher/terms")
      .then(setTerms)
      .catch(() => {});
  }, []);
  if (!terms?.length) return null;
  const cur = terms[0];
  const season = (n: number) => SEASONS.find((s) => s.season === n)?.name ?? SEASONS[SEASONS.length - 1].name;
  const next = nextTerm(cur.name);
  const nextName = next ? termName(next.semester, next.year) : "";

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!next) return;
    if (
      !window.confirm(
        `ปิดเทอม ${cur.name} และเปิดเทอม ${nextName}?\n\n• EXP/เลเวลของนักเรียนทุกคนเริ่มนับ 0 ใหม่ · ไข่เทอมใหม่ได้ตัวละคร${season(seasonOfSemester(next.semester))}\n• รายการงาน คะแนนสอบ เกรด เริ่มใหม่ (ข้อมูลเทอมเดิมยัง export ได้)\n• ตารางสอนเทอม ${cur.name} เลิกใช้ตั้งแต่วันเปิดเทอม${copy ? " (คัดลอกคาบเดิมมาใช้ต่อ)" : " — ลงตารางใหม่ที่หน้าตารางสอน"}\n• รายชื่อ ห้อง ตัวละคร avatar และไข่ที่ยังไม่เปิดยังอยู่ครบ\n\nย้อนกลับไม่ได้`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const t = await api<Term & { endedSlots: number; copiedSlots: number }>("/api/teacher/terms", {
        body: { semester: next.semester, year: next.year, from, copyTimetable: copy },
      });
      setTerms([t, ...terms!]);
      setOpen(false);
      setFlash(
        `เปิดเทอม ${t.name} แล้ว · ไข่ของเทอมนี้ได้ตัวละคร${season(t.season)} · ตารางเดิมเลิกใช้ ${t.endedSlots} คาบ${t.copiedSlots ? ` · คัดลอกมาใช้ต่อ ${t.copiedSlots} คาบ` : ""}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปิดเทอมไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="term-card">
      <Card className="p-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold"><Icon n="calendar" /> เทอม {cur.name}</h2>
            <p className="text-xs text-stone-500">
              คอลเลกชัน{season(cur.season)}
              {cur.startedAt > 0 && <> · เริ่ม {new Date(cur.startedAt).toLocaleDateString("th-TH", { dateStyle: "medium" })}</>}
            </p>
          </div>
          {!open && next?.semester === 2 && (
            <button type="button" className="rounded-xl border-2 border-line bg-white px-3 py-1.5 text-sm font-bold" onClick={() => setOpen(true)}>
              ขึ้นเทอม {nextName}
            </button>
          )}
        </div>
        {next?.semester === 1 && (
          <p className="text-xs text-stone-600 rounded-lg bg-stone-50 px-2 py-1.5" data-testid="next-year-note">
            เทอมถัดไปคือ <b>{nextName}</b> (ปีการศึกษาใหม่) — ใช้ขั้นตอน “ขึ้นปีการศึกษาใหม่”: เก็บห้องและนักเรียนปี {next.year - 1} ถาวร · นำเข้ารายชื่อใหม่จาก ZipGrade · ลงตารางสอนใหม่ (กำลังพัฒนา)
          </p>
        )}
        {flash && <p className="text-sm font-semibold text-board">{flash}</p>}
        <ErrorBox message={error} />
        {open && next && (
          <form onSubmit={start} className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex flex-col gap-2 text-sm">
            <p>
              ขึ้นเทอม <b>{nextName}</b>: รายชื่อและห้องเดิม · EXP นับ 0 ใหม่ · งาน/คะแนนสอบ/เกรดเริ่มใหม่ · ไข่เทอมใหม่ได้ตัวละคร
              <b>{season(seasonOfSemester(next.semester))}</b>
            </p>
            <label className="font-semibold flex flex-wrap items-center gap-2">
              วันเปิดเทอม {nextName}
              <input
                type="date"
                aria-label="วันเปิดเทอมใหม่"
                className="border-2 border-line rounded-xl px-3 py-1.5 bg-white"
                required
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <span className="text-xs font-normal text-stone-600">ตารางสอนเทอม {cur.name} เลิกใช้ตั้งแต่วันนี้ (ยอดคาบเทอมเดิมไม่เปลี่ยน)</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
              คัดลอกตารางสอนเทอม {cur.name} มาใช้ต่อ (แก้ทีหลังได้) — ไม่ติ๊ก = ลงตารางใหม่เอง
            </label>
            <p className="text-xs text-stone-600">ข้อมูลเทอมเดิม export ได้ที่หน้า “ส่งออกข้อมูล”</p>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !from}>
                เปิดเทอม {nextName}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                ยกเลิก
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
