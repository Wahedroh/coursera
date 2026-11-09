import { useEffect, useState } from "react";
import { api } from "../api";
import { SEASONS } from "../../shared/characters";
import type { Term } from "../../shared/terms";
import { Button, Card, ErrorBox } from "../ui";

/** ชื่อเทอมถัดไปแบบไทย: 1/2569 → 2/2569 · 2/2569 → 1/2570 */
export function nextTermName(name: string): string {
  const m = /^(\d)\/(\d{4})$/.exec(name.trim());
  if (!m) return "";
  return m[1] === "1" ? `2/${m[2]}` : `1/${Number(m[2]) + 1}`;
}

/** เทอมปัจจุบัน + ปุ่มปิดเทอม/เปิดเทอมใหม่ */
export default function TermCard() {
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    api<Term[]>("/api/teacher/terms")
      .then((t) => {
        setTerms(t);
        setName(nextTermName(t[0]?.name ?? ""));
      })
      .catch(() => {});
  }, []);
  if (!terms?.length) return null;
  const cur = terms[0];
  const season = (n: number) =>
    SEASONS.find((s) => s.season === n)?.name ??
    SEASONS[SEASONS.length - 1].name;
  const nextSeason = Math.min(cur.season + 1, SEASONS.length);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (
      !window.confirm(
        `ปิดเทอม ${cur.name} และเปิดเทอม ${name}?\n\n• EXP/เลเวลของนักเรียนทุกคนเริ่มนับ 0 ใหม่\n• รายการงาน คะแนนสอบ เกรด เริ่มใหม่ (ข้อมูลเทอมเดิมยัง export ได้)\n• ตัวละคร avatar และไข่ที่ยังไม่เปิดยังอยู่ครบ\n\nย้อนกลับไม่ได้`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const t = await api<Term>("/api/teacher/terms", { body: { name } });
      setTerms([t, ...terms!]);
      setOpen(false);
      setFlash(
        `เปิดเทอม ${t.name} แล้ว · ไข่ของเทอมนี้ได้ตัวละคร${season(t.season)}`,
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
            <h2 className="font-bold">🗓️ เทอม {cur.name}</h2>
            <p className="text-xs text-stone-500">
              คอลเลกชัน{season(cur.season)}
              {cur.startedAt > 0 && (
                <>
                  {" "}
                  · เริ่ม{" "}
                  {new Date(cur.startedAt).toLocaleDateString("th-TH", {
                    dateStyle: "medium",
                  })}
                </>
              )}
            </p>
          </div>
          {!open && (
            <button
              type="button"
              className="rounded-xl border-2 border-line bg-white px-3 py-1.5 text-sm font-bold"
              onClick={() => setOpen(true)}
            >
              ขึ้นเทอมใหม่
            </button>
          )}
        </div>
        {flash && <p className="text-sm font-semibold text-board">{flash}</p>}
        <ErrorBox message={error} />
        {open && (
          <form
            onSubmit={start}
            className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex flex-col gap-2 text-sm"
          >
            <p>
              เริ่มเทอมใหม่: EXP นับ 0 ใหม่ · งาน/คะแนนสอบ/เกรดเริ่มใหม่ ·
              ไข่เทอมใหม่ได้ตัวละคร<b>{season(nextSeason)}</b>
            </p>
            <p className="text-xs text-stone-600">
              ตัวละครที่สะสมแล้ว avatar รายชื่อ คลิป เอกสาร ยังอยู่ครบ ·
              ข้อมูลเทอมเดิม export ได้ที่หน้า “ส่งออกข้อมูล”
            </p>
            <label className="font-semibold flex items-center gap-2">
              ชื่อเทอมใหม่
              <input
                aria-label="ชื่อเทอมใหม่"
                className="border-2 border-line rounded-xl px-3 py-1.5 bg-white w-32"
                required
                maxLength={30}
                placeholder="1/2570"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !name.trim()}>
                เปิดเทอม {name}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                ยกเลิก
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
