import { useEffect, useState } from 'react'
import { api } from '../api'
import { todayBangkok } from '../../shared/attendance'
import { EXPORT_KINDS, EXPORT_LABEL, type ClassExport, type ExportKind } from '../../shared/export'
import { attendanceSheet, classFeesSheet, exportWorkbook, gradebookSheet, gradesSheet } from '../lib/excel'
import { Button, Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type School = { schoolId: string; schoolName: string; classes: { id: string; name: string; grade: number | null }[] }
const input = 'border-2 border-line rounded-xl px-3 py-2 bg-white'

/** ส่งออก Excel แยกตามห้อง หรือทั้งโรงเรียน — 1 ไฟล์ หลายชีต (ชีตละห้องต่อประเภทข้อมูล) */
export default function TeacherExport() {
  const handle = useTeacherErrorHandler()
  const [schools, setSchools] = useState<School[] | null>(null)
  const [schoolId, setSchoolId] = useState('')
  const [classIds, setClassIds] = useState<string[]>([])
  const [kinds, setKinds] = useState<ExportKind[]>([...EXPORT_KINDS])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    api<School[]>('/api/teacher/classes')
      .then((s) => {
        setSchools(s)
        if (s[0]) pickSchool(s[0])
      })
      .catch((e) => setError(handle(e)))
  }, [handle])

  function pickSchool(s: School) {
    setSchoolId(s.schoolId)
    setClassIds(s.classes.map((c) => c.id))
  }
  const school = schools?.find((s) => s.schoolId === schoolId)
  const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x])
  const short = (c: School['classes'][number]) => (c.grade !== null ? `ชั้น ${c.grade}` : c.name)

  async function run() {
    if (!school) return
    const chosen = school.classes.filter((c) => classIds.includes(c.id))
    setError(null)
    setFlash(null)
    try {
      const data: { cls: School['classes'][number]; x: ClassExport }[] = []
      for (const [i, cls] of chosen.entries()) {
        setBusy(`กำลังดึงข้อมูล ${i + 1}/${chosen.length}`)
        const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })
        data.push({ cls, x: await api<ClassExport>(`/api/teacher/classes/${cls.id}/export?${qs}`) })
      }
      setBusy('กำลังสร้างไฟล์')
      const one = chosen.length === 1
      const sheets = kinds.flatMap((k) =>
        data.map(({ cls, x }) => ({
          name: one ? EXPORT_LABEL[k] : `${EXPORT_LABEL[k]} ${short(cls)}`,
          data: k === 'scores' ? gradebookSheet(x.gradebook, x.scoreBook) : k === 'attendance' ? attendanceSheet(x.attendance) : k === 'grades' ? gradesSheet(x.grades) : classFeesSheet(x),
        })),
      )
      const scope = one ? chosen[0].name : chosen.length === school.classes.length ? `${school.schoolName}-ทั้งโรงเรียน` : `${school.schoolName}-${chosen.map(short).join('-')}`
      await exportWorkbook(sheets, `${scope}-${todayBangkok()}.xlsx`)
      setFlash(`ส่งออกแล้ว ${chosen.length} ห้อง · ${sheets.length} ชีต`)
    } catch (e) {
      setError(handle(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <TeacherLayout>
      <h1 className="text-2xl font-extrabold">ส่งออกข้อมูล (Excel)</h1>
      <ErrorBox message={error} />
      {flash && <Card className="p-3 bg-board-soft border-green-200 text-board font-semibold">{flash}</Card>}
      {!schools && !error && <Loading />}
      {schools && (
        <Card className="p-4 flex flex-col gap-4">
          <label className="text-sm font-semibold flex flex-col gap-1">
            โรงเรียน
            <select aria-label="โรงเรียน" className={input} value={schoolId} onChange={(e) => pickSchool(schools.find((s) => s.schoolId === e.target.value)!)}>
              {schools.map((s) => (
                <option key={s.schoolId} value={s.schoolId}>
                  {s.schoolName}
                </option>
              ))}
            </select>
          </label>
          {school && (
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-semibold mb-1">
                ห้อง{' '}
                <button type="button" className="ml-2 text-xs font-normal underline" onClick={() => setClassIds(school.classes.map((c) => c.id))}>
                  ทั้งโรงเรียน
                </button>
              </legend>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {school.classes.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={classIds.includes(c.id)} onChange={() => setClassIds((xs) => toggle(xs, c.id))} aria-label={c.name} />
                    {short(c)}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-semibold mb-1">ข้อมูล</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {EXPORT_KINDS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={kinds.includes(k)} onChange={() => setKinds((xs) => toggle(xs, k))} />
                  {EXPORT_LABEL[k]}
                </label>
              ))}
            </div>
            <p className="text-xs text-stone-500">คะแนน = งานทุกชิ้น + คะแนนสอบทุกรายการ · เกรด = คะแนนสะสม อันดับ เกรดอิงกลุ่ม · ค่าเอกสาร = ทุกรายการของห้องพร้อมยอดค้าง</p>
          </fieldset>
          {kinds.includes('attendance') && (
            <div className="flex flex-wrap gap-3 items-end text-sm">
              <label className="font-semibold flex flex-col gap-1">
                เช็กชื่อตั้งแต่
                <input type="date" className={input} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="เช็กชื่อตั้งแต่" />
              </label>
              <label className="font-semibold flex flex-col gap-1">
                ถึง
                <input type="date" className={input} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="เช็กชื่อถึง" />
              </label>
              <span className="text-xs text-stone-500 pb-2">เว้นว่าง = ทั้งหมดจนถึงวันนี้</span>
            </div>
          )}
          <Button type="button" onClick={() => void run()} disabled={busy !== null || classIds.length === 0 || kinds.length === 0}>
            {busy ?? '⬇ ส่งออก Excel'}
          </Button>
          <p className="text-xs text-stone-500">ได้ 1 ไฟล์ แยกชีตตามประเภทข้อมูลและห้อง (เช่น "คะแนน ชั้น 1", "เช็กชื่อ ชั้น 1")</p>
        </Card>
      )}
    </TeacherLayout>
  )
}
