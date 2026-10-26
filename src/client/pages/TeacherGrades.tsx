import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, fullName } from '../api'
import { bandRanges, DEFAULT_BANDS, FIVE_LEVEL_BANDS, type ClassGrades, type GradeBand } from '../../shared/grades'
import { exportGrades } from '../lib/excel'
import { Button, Card, Chip, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

const TONE = ['bg-board text-white', 'bg-green-600 text-white', 'bg-green-100 text-green-800', 'bg-lime-100 text-lime-800', 'bg-amber-100 text-amber-800', 'bg-orange-100 text-orange-800', 'bg-red-100 text-red-700', 'bg-red-500 text-white']
const toneOf = (bands: GradeBand[], grade: string | null) => {
  const i = bands.findIndex((b) => b.grade === grade)
  return i < 0 ? 'bg-stone-100 text-stone-500' : TONE[Math.min(TONE.length - 1, Math.round((i / Math.max(1, bands.length - 1)) * (TONE.length - 1)))]
}

export default function TeacherGrades() {
  const { id = '' } = useParams()
  const handle = useTeacherErrorHandler()
  const [data, setData] = useState<ClassGrades | null>(null)
  const [bands, setBands] = useState<GradeBand[]>([])
  const [visible, setVisible] = useState(false)
  const [className, setClassName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const apply = useCallback((g: ClassGrades) => {
    setData(g)
    setBands(g.settings.bands)
    setVisible(g.settings.visible)
    setDirty(false)
  }, [])
  useEffect(() => {
    api<ClassGrades>(`/api/teacher/classes/${id}/grades`).then(apply).catch((e) => setError(handle(e)))
    api<{ class: { name: string } }>(`/api/teacher/classes/${id}/students`).then((d) => setClassName(d.class.name)).catch(() => {})
  }, [id, handle, apply])

  async function save(next: { bands: GradeBand[]; visible: boolean }, msg: string) {
    setError(null)
    try {
      apply(await api<ClassGrades>(`/api/teacher/classes/${id}/grading`, { method: 'PUT', body: next }))
      setFlash(msg)
    } catch (e) {
      setError(handle(e))
      if (data) setVisible(data.settings.visible)
    }
  }

  const edit = (i: number, p: Partial<GradeBand>) => {
    setBands(bands.map((b, j) => (j === i ? { ...b, ...p } : b)))
    setDirty(true)
  }

  if (!data) return <TeacherLayout>{error ? <ErrorBox message={error} /> : <Loading />}</TeacherLayout>
  const saved = data.settings.bands
  const dist = saved.map((b) => ({ grade: b.grade, n: data.students.filter((s) => s.grade === b.grade).length }))
  const ranges = bandRanges(bands)
  const valid = bands.length >= 2 && bands.every((b, i) => b.grade.trim() && Number.isInteger(b.min) && b.min >= 0 && b.min <= 100 && (i === 0 || b.min < bands[i - 1].min)) && bands[bands.length - 1].min === 0

  return (
    <TeacherLayout>
      <Link to={`/teacher/classes/${id}`} className="text-sm text-stone-500">
        ← {className || 'หน้าห้อง'}
      </Link>
      <div className="flex flex-wrap justify-between items-end gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">เกรด (อิงกลุ่ม)</h1>
          <p className="text-sm text-stone-500">
            คะแนนสะสมเต็ม <b>{data.maxTotal}</b> คะแนน · จากงานที่ตรวจแล้ว {data.itemCounts.assignments} ชิ้น + สอบ {data.itemCounts.exams} รายการ · จัดอันดับในห้องนี้ {data.students.length} คน
          </p>
        </div>
        <button type="button" disabled={data.maxTotal === 0} onClick={() => exportGrades(data, className)} className="rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold disabled:opacity-40">
          ⬇ Excel เกรด
        </button>
      </div>
      <ErrorBox message={error} />
      {flash && <Card className="p-3 bg-board-soft border-green-200 text-board font-semibold">{flash}</Card>}

      <Card className="p-4 flex flex-col gap-3">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h2 className="font-bold">เกณฑ์เปอร์เซ็นไทล์</h2>
          <span className="flex gap-2 text-xs">
            <button type="button" className="underline text-board" onClick={() => (setBands(DEFAULT_BANDS), setDirty(true))}>
              ใช้ 8 ระดับ
            </button>
            <button type="button" className="underline text-board" onClick={() => (setBands(FIVE_LEVEL_BANDS), setDirty(true))}>
              ใช้ 5 ระดับ
            </button>
          </span>
        </div>
        <p className="text-xs text-stone-500">เปอร์เซ็นไทล์ = % ของคนในห้องที่คะแนน ≤ เรา (คนที่สูงสุดได้ 100) · เช่น 76–100 = กลุ่มบน 25% · คะแนนเท่ากันได้เกรดเท่ากัน</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2">
          {bands.map((b, i) => (
            <div key={i} className="rounded-xl border-2 border-line bg-white p-2 flex flex-col gap-1">
              <label className="text-xs text-stone-500">
                เกรด
                <input aria-label={`เกรดช่วงที่ ${i + 1}`} className="w-full border-2 border-line rounded-lg px-2 py-1 font-bold" maxLength={5} value={b.grade} onChange={(e) => edit(i, { grade: e.target.value })} />
              </label>
              <label className="text-xs text-stone-500">
                ตั้งแต่เปอร์เซ็นไทล์
                <input
                  aria-label={`เปอร์เซ็นไทล์ขั้นต่ำของเกรด ${b.grade}`}
                  type="number"
                  min={0}
                  max={100}
                  disabled={i === bands.length - 1}
                  className="w-full border-2 border-line rounded-lg px-2 py-1 disabled:bg-stone-100"
                  value={b.min}
                  onChange={(e) => edit(i, { min: Number(e.target.value) })}
                />
              </label>
              <span className="text-xs font-semibold text-board">ช่วง {ranges[i]}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Button type="button" disabled={!dirty || !valid} onClick={() => save({ bands, visible }, 'บันทึกเกณฑ์แล้ว')} className="py-2">
            บันทึกเกณฑ์
          </Button>
          {!valid && <span className="text-xs text-red-600">ต้องเรียงจากมากไปน้อย ช่วงสุดท้ายเริ่มที่ 0 และใส่ชื่อเกรดทุกช่อง</span>}
          <label className="flex items-center gap-2 text-sm ml-auto">
            <input
              type="checkbox"
              checked={visible}
              onChange={(e) => {
                const v = e.target.checked
                setVisible(v)
                void save({ bands: saved, visible: v }, v ? 'นักเรียนเห็นเกรดคาดการณ์ของตัวเองแล้ว' : 'ซ่อนเกรดจากนักเรียนแล้ว')
              }}
            />
            ให้นักเรียนเห็นเกรดของตัวเอง
          </label>
        </div>
      </Card>

      {data.maxTotal === 0 ? (
        <Card className="p-6 text-center text-sm text-stone-500">ยังไม่มีคะแนน — ตรวจงานหรือกรอกคะแนนสอบก่อน ระบบจะตัดเกรดให้อัตโนมัติ</Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" data-testid="grade-dist">
            {dist.map((d) => (
              <span key={d.grade} className={`rounded-xl px-3 py-1.5 text-sm font-bold ${toneOf(saved, d.grade)}`}>
                เกรด {d.grade}: {d.n} คน
              </span>
            ))}
          </div>
          <Card className="p-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-500">
                  <th className="p-2">#</th>
                  <th className="p-2">ชื่อ · ZipGrade ID</th>
                  <th className="p-2 text-right">งาน</th>
                  <th className="p-2 text-right">สอบ</th>
                  <th className="p-2 text-right">รวม /{data.maxTotal}</th>
                  <th className="p-2 text-right">อันดับ</th>
                  <th className="p-2 text-right">เปอร์เซ็นไทล์</th>
                  <th className="p-2 text-center">เกรด</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s, i) => (
                  <tr key={s.id} className="border-t border-stone-100">
                    <td className="p-2 text-stone-400">{i + 1}</td>
                    <td className="p-2">
                      <span className="block whitespace-nowrap">{fullName(s)}</span>
                      <span className="block text-xs text-stone-500 font-mono">{s.zipgradeId}</span>
                    </td>
                    <td className="p-2 text-right">{s.assignmentTotal}</td>
                    <td className="p-2 text-right">{s.examTotal}</td>
                    <td className="p-2 text-right font-bold">{s.total}</td>
                    <td className="p-2 text-right">{s.rank}</td>
                    <td className="p-2 text-right">{s.percentile}</td>
                    <td className="p-2 text-center" data-testid={`grade-${s.zipgradeId}`}>
                      <span className={`inline-block min-w-10 rounded-lg px-2 py-0.5 font-extrabold ${toneOf(saved, s.grade)}`}>{s.grade}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-stone-500">
            <Chip>หมายเหตุ</Chip> เกรดเปลี่ยนได้ทุกครั้งที่มีคะแนนใหม่ (ยังไม่ส่ง/ยังไม่กรอก/ขาดสอบ นับเป็น 0) · นักเรียนที่ปิดใช้งานไม่ถูกนำมาจัดอันดับ
          </p>
        </>
      )}
    </TeacherLayout>
  )
}
