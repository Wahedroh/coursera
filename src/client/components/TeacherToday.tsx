import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import { DUE_SOON_DAYS, type TeacherToday as Today } from "../../shared/today";
import { formatDue } from "../lib/format";
import { Card } from "../ui";

/** สรุปวันนี้: งานรอตรวจ · ขาดเรียนวันนี้ · งานใกล้ครบกำหนด (ทุกห้อง) */
export default function TeacherToday() {
  const [t, setT] = useState<Today | null>(null);
  useEffect(() => {
    api<Today>("/api/teacher/today")
      .then(setT)
      .catch(() => {});
  }, []);
  if (!t) return null;
  const waiting = t.toGrade.reduce((n, x) => n + x.waiting, 0);
  const absent = t.absent.reduce((n, x) => n + x.names.length, 0);
  const box =
    "rounded-xl border border-line bg-white p-3 flex flex-col gap-1.5 min-w-0";
  return (
    <div data-testid="teacher-today">
      <Card className="p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold">📋 สรุปวันนี้</h2>
          <span className="text-xs text-stone-500">เทอม {t.term}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <section className={box} aria-label="งานรอตรวจ">
            <h3 className="text-sm font-bold">
              ✅ รอตรวจ{" "}
              <span className={waiting ? "text-amber-600" : "text-stone-400"}>
                {waiting} ชิ้น
              </span>
            </h3>
            {t.toGrade.length === 0 && (
              <p className="text-xs text-stone-500">ตรวจครบแล้ว 🎉</p>
            )}
            {t.toGrade.slice(0, 6).map((x) => (
              <Link
                key={x.assignmentId}
                to={`/teacher/submissions/${x.firstSubmissionId}`}
                className="flex justify-between gap-2 text-sm hover:underline"
              >
                <span className="truncate">
                  {x.title}{" "}
                  <span className="text-xs text-stone-500">
                    · {x.className}
                  </span>
                </span>
                <b className="text-amber-600 shrink-0">{x.waiting}</b>
              </Link>
            ))}
            {t.toGrade.length > 6 && (
              <p className="text-xs text-stone-500">
                และอีก {t.toGrade.length - 6} งาน
              </p>
            )}
          </section>
          <section className={box} aria-label="ขาดเรียนวันนี้">
            <h3 className="text-sm font-bold">
              🚫 ขาดวันนี้{" "}
              <span className={absent ? "text-red-600" : "text-stone-400"}>
                {absent} คน
              </span>
            </h3>
            {t.absent.length === 0 && (
              <p className="text-xs text-stone-500">
                ไม่มีคนขาด (หรือยังไม่ได้เช็กชื่อ)
              </p>
            )}
            {t.absent.map((x) => (
              <Link
                key={x.classId}
                to={`/teacher/classes/${x.classId}/attendance`}
                className="text-sm hover:underline"
              >
                <b>{x.className}</b>{" "}
                <span className="text-stone-600">{x.names.join(", ")}</span>
              </Link>
            ))}
          </section>
          <section className={box} aria-label="ใกล้ครบกำหนด">
            <h3 className="text-sm font-bold">
              ⏰ ครบกำหนดใน {DUE_SOON_DAYS} วัน
            </h3>
            {t.dueSoon.length === 0 && (
              <p className="text-xs text-stone-500">ไม่มีงานใกล้ครบกำหนด</p>
            )}
            {t.dueSoon.map((x) => (
              <Link
                key={x.assignmentId}
                to={`/teacher/classes/${x.classId}/gradebook`}
                className="text-sm hover:underline"
              >
                <span className="block truncate">
                  {x.title}{" "}
                  <span className="text-xs text-stone-500">
                    · {x.className}
                  </span>
                </span>
                <span className="text-xs text-stone-500">
                  {formatDue(x.dueAt)} · ยังไม่ส่ง{" "}
                  <b className={x.missing ? "text-red-600" : ""}>{x.missing}</b>{" "}
                  คน
                </span>
              </Link>
            ))}
          </section>
        </div>
      </Card>
    </div>
  );
}
