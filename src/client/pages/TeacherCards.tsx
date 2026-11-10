import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api'
import QrCard from '../components/QrCard'
import { ErrorBox, Loading } from '../ui'
import { useTeacherErrorHandler } from './useTeacherGuard'

type Cards = { class: { id: string; name: string }; students: { id: string; no: number; zipgradeId: string; name: string }[] }
/** ต่อหน้า A4 → ขนาดการ์ด (มม.) และจำนวนคอลัมน์ */
const LAYOUT = { 4: { mm: 92, cols: 2 }, 2: { mm: 128, cols: 1 }, 1: { mm: 185, cols: 1 } } as const
type Per = keyof typeof LAYOUT

/** หน้าพิมพ์การ์ด QR ของทั้งห้อง (หรือรายคน) */
export default function TeacherCards() {
  const { id = '' } = useParams()
  const handle = useTeacherErrorHandler()
  const [data, setData] = useState<Cards | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [per, setPer] = useState<Per>(4)
  const [only, setOnly] = useState('')

  useEffect(() => {
    api<Cards>(`/api/teacher/classes/${id}/cards`)
      .then(setData)
      .catch((e) => setError(handle(e)))
  }, [id, handle])

  if (!data) return error ? <ErrorBox message={error} /> : <Loading />
  const list = only ? data.students.filter((s) => s.id === only) : data.students
  const { mm, cols } = LAYOUT[per]
  return (
    <main className="min-h-screen bg-stone-100 print:bg-white">
      <style>{`@page { size: A4; margin: 8mm } @media print { .no-print { display: none !important } }`}</style>
      <div className="no-print sticky top-0 z-10 bg-white border-b border-line px-4 py-3 flex flex-wrap gap-3 items-center">
        <Link to="/teacher/card-game" className="text-sm text-stone-500">
          ← เกมการ์ด
        </Link>
        <b>การ์ด QR · {data.class.name}</b>
        <label className="text-sm flex items-center gap-1">
          ต่อหน้า
          <select aria-label="จำนวนการ์ดต่อหน้า" className="border-2 border-line rounded-lg px-2 py-1" value={per} onChange={(e) => setPer(Number(e.target.value) as Per)}>
            <option value={4}>4 ใบ (เล็ก · ห้องเล็ก)</option>
            <option value={2}>2 ใบ (กลาง)</option>
            <option value={1}>1 ใบ (ใหญ่ · สแกนได้ไกล)</option>
          </select>
        </label>
        <label className="text-sm flex items-center gap-1">
          พิมพ์
          <select aria-label="พิมพ์ของใคร" className="border-2 border-line rounded-lg px-2 py-1" value={only} onChange={(e) => setOnly(e.target.value)}>
            <option value="">ทั้งห้อง ({data.students.length} คน)</option>
            {data.students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.no}. {s.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => window.print()} className="rounded-xl bg-board text-white px-4 py-2 font-bold">
          🖨️ พิมพ์
        </button>
        <span className="text-xs text-stone-500 w-full">ตัดตามเส้นประ · เคลือบพลาสติกใช้ได้ทั้งเทอม · นักเรียนหมุนการ์ดให้ตัวอักษรที่ตอบอยู่ด้านบน</span>
      </div>
      <div className="flex justify-center py-4 print:py-0">
        <div className="bg-white print:shadow-none shadow grid gap-[3mm] p-[3mm]" style={{ gridTemplateColumns: `repeat(${cols}, ${mm}mm)` }}>
          {list.map((s) => (
            <QrCard key={s.id} zipgradeId={s.zipgradeId} sizeMm={mm} label={`${s.no} · ${s.name} · ${s.zipgradeId}`} />
          ))}
        </div>
      </div>
    </main>
  )
}
