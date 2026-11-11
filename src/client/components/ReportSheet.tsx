import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import { AvatarArt, CharacterArt } from "./PixelArt";
import { avatarConfigSchema, DEFAULT_AVATAR } from "../../shared/avatar";
import type { ReportCard } from "../../shared/report";

const STATUS: Record<string, string> = {
  graded: "ตรวจแล้ว",
  submitted: "ส่งแล้ว",
  late: "ส่งช้า",
  missing: "ไม่ส่ง",
  returned: "ส่งกลับแก้",
  pending: "ยังไม่ถึงกำหนด",
};
const date = (t: number | string) =>
  new Date(
    typeof t === "string" ? `${t}T12:00:00+07:00` : t,
  ).toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
  });
const avatarOf = (v: unknown) => {
  const r = avatarConfigSchema.safeParse(v);
  return r.success ? r.data : DEFAULT_AVATAR;
};

/** ใบสรุปผลปลายเทอม ขนาด A4 (210×297 มม.) — ข้อมูลเยอะจะแบ่ง 2 คอลัมน์และย่อให้พอดี 1 หน้าเสมอ */
const ReportSheet = forwardRef<HTMLDivElement, { card: ReportCard }>(
  function ReportSheet({ card }, ref) {
    const inner = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const twoCol = card.assignments.length > 14;
    useLayoutEffect(() => {
      const el = inner.current;
      if (!el) return;
      el.style.transform = "none";
      const box = el.parentElement!;
      const k = Math.min(1, box.clientHeight / el.scrollHeight);
      setScale(k < 1 ? Math.max(0.55, k * 0.99) : 1);
    }, [card]);
    const a = card.attendance;
    const half = Math.ceil(card.assignments.length / 2);
    const asgTable = (rows: ReportCard["assignments"]) => (
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-[#e3f1ea]">
            <th className="border border-stone-300 px-1.5 py-0.5 text-left">
              งาน
            </th>
            <th className="border border-stone-300 px-1.5 py-0.5 text-left">
              กำหนดส่ง
            </th>
            <th className="border border-stone-300 px-1.5 py-0.5 text-left">
              สถานะ
            </th>
            <th className="border border-stone-300 px-1.5 py-0.5 text-left">
              คะแนน
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x, i) => (
            <tr key={i}>
              <td className="border border-stone-300 px-1.5 py-0.5">
                {x.title}
              </td>
              <td className="border border-stone-300 px-1.5 py-0.5 whitespace-nowrap">
                {x.dueAt ? date(x.dueAt) : "–"}
              </td>
              <td
                className={`border border-stone-300 px-1.5 py-0.5 whitespace-nowrap ${x.status === "missing" ? "text-red-700 font-semibold" : ""}`}
              >
                {STATUS[x.status] ?? x.status}
              </td>
              <td className="border border-stone-300 px-1.5 py-0.5 whitespace-nowrap tabular-nums">
                {x.score !== null
                  ? `${x.score}/${x.maxScore}`
                  : `–/${x.maxScore}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
    return (
      <div
        ref={ref}
        className="print-page bg-white text-stone-900 shadow-lg mx-auto overflow-hidden flex flex-col"
        style={{ width: "210mm", height: "297mm", padding: "12mm 13mm" }}
        data-testid="report-sheet"
      >
        <div className="flex-1 min-h-0 overflow-hidden">
          <div
            ref={inner}
            className="flex flex-col gap-2.5 text-[11px] leading-snug"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              width: `${100 / scale}%`,
            }}
          >
            <header className="flex justify-between items-center border-b-2 border-board pb-2 gap-3">
              <div>
                <h1 className="text-lg font-extrabold">ใบสรุปผลการเรียน</h1>
                <p>
                  ภาคเรียนที่ {card.term} · {card.className} · ห้องเรียน Change
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <b className="text-sm">{card.student.name}</b>
                  {card.student.nickname && (
                    <div>“{card.student.nickname}”</div>
                  )}
                  <div>ZipGrade ID {card.student.zipgradeId}</div>
                </div>
                <div className="rounded-lg border-2 border-[#D2C9AE] bg-[#E8DFC4] px-2 py-1">
                  <AvatarArt
                    config={avatarOf(card.student.avatar)}
                    size={3}
                    label={`ตัวละครของ ${card.student.name}`}
                  />
                </div>
              </div>
            </header>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded border border-stone-300 px-2 py-1.5">
                <b>คะแนนสะสม</b>{" "}
                {card.total ? (
                  <>
                    {card.total.total} / {card.total.maxTotal}
                    {card.total.grade !== null && (
                      <>
                        {" "}
                        · <b>เกรด {card.total.grade}</b>
                      </>
                    )}
                    {card.total.rank !== null && (
                      <>
                        {" "}
                        · อันดับ {card.total.rank}/{card.total.of}
                      </>
                    )}
                  </>
                ) : (
                  "–"
                )}
              </div>
              <div className="rounded border border-stone-300 px-2 py-1.5">
                <b>การมาเรียน</b> มา {a.present} · สาย {a.late} · ป่วย {a.sick}{" "}
                · ลา {a.leave} · ขาด {a.absent}
                {a.pct !== null && ` (${a.pct}%)`}
              </div>
            </div>
            <section>
              <b>งานที่มอบหมาย ({card.assignments.length} ชิ้น)</b>
              {card.assignments.length === 0 ? (
                <p className="text-stone-500">ไม่มีงาน</p>
              ) : twoCol ? (
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {asgTable(card.assignments.slice(0, half))}
                  {asgTable(card.assignments.slice(half))}
                </div>
              ) : (
                <div className="mt-1">{asgTable(card.assignments)}</div>
              )}
            </section>
            <section>
              <b>คะแนนสอบ</b>
              {card.exams.length === 0 ? (
                <p className="text-stone-500">ยังไม่มีคะแนนสอบที่เผยแพร่</p>
              ) : (
                <table className="w-full border-collapse mt-1">
                  <thead>
                    <tr className="bg-[#e3f1ea]">
                      <th className="border border-stone-300 px-1.5 py-0.5 text-left">
                        รายการ
                      </th>
                      <th className="border border-stone-300 px-1.5 py-0.5 text-left">
                        วันที่
                      </th>
                      <th className="border border-stone-300 px-1.5 py-0.5 text-left">
                        คะแนน
                      </th>
                      <th className="border border-stone-300 px-1.5 py-0.5 text-left">
                        %
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.exams.map((x, i) => (
                      <tr key={i}>
                        <td className="border border-stone-300 px-1.5 py-0.5">
                          {x.title}
                        </td>
                        <td className="border border-stone-300 px-1.5 py-0.5 whitespace-nowrap">
                          {date(x.takenOn)}
                        </td>
                        <td className="border border-stone-300 px-1.5 py-0.5 tabular-nums">
                          {x.absent
                            ? "ขาดสอบ"
                            : x.score !== null
                              ? `${x.score}/${x.maxScore}`
                              : "–"}
                        </td>
                        <td className="border border-stone-300 px-1.5 py-0.5 tabular-nums">
                          {x.pct ?? "–"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded border border-stone-300 px-2 py-1.5">
                <b>กิจกรรม</b> LV {card.activity.level} · {card.activity.exp}{" "}
                EXP · ตัวละคร {card.activity.characters.length} ตัว
                {card.activity.characters.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 my-1">
                    {card.activity.characters.slice(0, 32).map((c) => (
                      <CharacterArt key={c} id={c} size={2} />
                    ))}
                  </div>
                )}
                {card.activity.badges.length > 0 && (
                  <div>เหรียญตรา: {card.activity.badges.join(" · ")}</div>
                )}
                <div>
                  ทบทวนคลิป {card.activity.videos} คลิป · ภารกิจสัปดาห์{" "}
                  {card.activity.quests} ครั้ง
                </div>
              </div>
              <div className="rounded border border-stone-300 px-2 py-1.5 min-h-16">
                <b>ความเห็นครู</b>
                <p className="whitespace-pre-line">{card.comment ?? ""}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-between text-[9px] text-stone-500 border-t border-stone-300 pt-1 mt-2 shrink-0">
          <span>
            ออกโดยระบบผู้ช่วยครู ·{" "}
            {new Date(card.issuedAt).toLocaleDateString("th-TH", {
              timeZone: "Asia/Bangkok",
              dateStyle: "long",
            })}
          </span>
          <span>ลงชื่อครูผู้สอน ..............................</span>
        </div>
      </div>
    );
  },
);
export default ReportSheet;
