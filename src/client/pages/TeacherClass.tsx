import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, fullName } from '../api'
import type { StudentAdminRow } from '../../server/roster/service'
import type { Gradebook } from '../../shared/assignments'
import type { ClassGrades } from '../../shared/grades'
import type { ScoreBook } from '../../shared/scores'
import { Card, Chip, ErrorBox, Loading } from '../ui'
import AddStudentForm from '../components/AddStudentForm'
import ClassMenu from '../components/ClassMenu'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type Data = { class: { id: string; name: string; joinCode: string }; students: StudentAdminRow[] }

const small = 'rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold whitespace-nowrap'
type Sort = 'roster' | 'desc' | 'asc'
type Grade = ClassGrades['students'][number]

export default function TeacherClass() {
  const { id } = useParams()
  const handle = useTeacherErrorHandler()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [grades, setGrades] = useState<ClassGrades | null>(null)
  const [sort, setSort] = useState<Sort>('roster')
  const [exp, setExp] = useState<Map<string, { exp: number; level: number }>>(new Map())
  const [open, setOpen] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ gb: Gradebook; book: ScoreBook } | null>(null)

  const load = useCallback(() => {
    api<Data>(`/api/teacher/classes/${id}/students`)
      .then(setData)
      .catch((e) => setError(handle(e)))
  }, [id, handle])

  useEffect(load, [load])
  const loadGrades = useCallback(() => {
    api<{ studentId: string; exp: number; level: number }[]>(`/api/teacher/classes/${id}/points`)
      .then((p) => setExp(new Map(p.map((x) => [x.studentId, { exp: x.exp, level: x.level }]))))
      .catch(() => {})
    api<ClassGrades>(`/api/teacher/classes/${id}/grades`)
      .then(setGrades)
      .catch(() => {})
  }, [id])
  useEffect(loadGrades, [loadGrades])

  /** เปิดดูคะแนนรายชิ้นของนักเรียน (โหลดสมุดคะแนนครั้งแรกที่เปิด) */
  async function toggleDetail(sid: string) {
    setOpen(open === sid ? null : sid)
    if (detail || open === sid) return
    try {
      const [gb, book] = await Promise.all([api<Gradebook>(`/api/teacher/classes/${id}/gradebook`), api<ScoreBook>(`/api/teacher/classes/${id}/score-book`)])
      setDetail({ gb, book })
    } catch (e) {
      setError(handle(e))
    }
  }

  async function remove(s: StudentAdminRow) {
    const name = fullName(s)
    if (!window.confirm(`ลบ ${name} (ZipGrade ID ${s.zipgradeId}) ออกจากระบบถาวร?\n\nงานที่ส่งพร้อมรูป คะแนน เช็กชื่อ แต้ม ค่าเอกสาร และตัวละครของคนนี้จะถูกลบทั้งหมด และกู้คืนไม่ได้`)) return
    try {
      await api(`/api/teacher/students/${s.id}`, { method: 'DELETE' })
      setFlash(`ลบ ${name} แล้ว`)
      setDetail(null)
      load()
      loadGrades()
    } catch (e) {
      setError(handle(e))
    }
  }

  async function act(path: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    try {
      await api(path, { body: {} })
      load()
    } catch (e) {
      setError(handle(e))
    }
  }

  return (
    <TeacherLayout>
      <Link to="/teacher" className="text-sm text-stone-500">
        ← หน้าแรก
      </Link>
      <ErrorBox message={error} />
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="flex flex-wrap justify-between items-end gap-2">
            <div>
              <h1 className="text-2xl font-extrabold">{data.class.name}</h1>
              <p className="text-sm text-stone-500">
                {data.students.filter((s) => s.active).length} คน · ตั้ง PIN แล้ว {data.students.filter((s) => s.pinSet).length}
              </p>
            </div>
            <ClassMenu classId={data.class.id} />
            <div className="text-right">
              <div className="text-xs text-stone-500">รหัสห้อง</div>
              <div className="text-xl font-extrabold tracking-[0.3em]">{data.class.joinCode}</div>
            </div>
          </div>
          {flash && <Card className="p-3 bg-board-soft border-green-200 text-board font-semibold">{flash}</Card>}
          <AddStudentForm
            classId={data.class.id}
            onAdded={(name) => {
              setFlash(`เพิ่ม ${name} แล้ว — ให้นักเรียนเข้าเว็บด้วย ZipGrade ID แล้วตั้ง PIN`)
              setError(null)
              load()
            }}
            onError={(e) => setError(handle(e))}
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="sort" className="font-semibold">
              เรียงตาม
            </label>
            <select id="sort" className="border-2 border-line rounded-xl px-3 py-1.5 bg-white" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="roster">ลำดับรายชื่อ</option>
              <option value="desc">คะแนนรวม มาก → น้อย</option>
              <option value="asc">คะแนนรวม น้อย → มาก</option>
            </select>
            {grades && <span className="text-xs text-stone-500">คะแนนรวม = งานที่ตรวจแล้ว + คะแนนสอบ (เต็ม {grades.maxTotal}) · แตะคะแนนเพื่อดูรายชิ้น</span>}
          </div>
          <Card className="p-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-500">
                  <th className="p-2">#</th>
                  <th className="p-2">ZipGrade ID</th>
                  <th className="p-2">ชื่อ</th>
                  <th className="p-2 text-right whitespace-nowrap">งาน</th>
                  <th className="p-2 text-right whitespace-nowrap">สอบ</th>
                  <th className="p-2 text-right whitespace-nowrap">
                    <button type="button" className="font-semibold underline decoration-dotted" onClick={() => setSort(sort === 'desc' ? 'asc' : 'desc')} aria-label="สลับเรียงคะแนนรวม">
                      รวม {sort === 'desc' ? '↓' : sort === 'asc' ? '↑' : ''}
                    </button>
                  </th>
                  <th className="p-2">เกรด</th>
                  <th className="p-2 text-right whitespace-nowrap">EXP (เทอมนี้)</th>
                  <th className="p-2">PIN</th>
                  <th className="p-2">สถานะ</th>
                  <th className="p-2">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {sorted(data.students, grades, sort).map(({ s, g }, i) => (
                  <Fragment key={s.id}>
                    <tr className={`border-t border-stone-100 ${s.active ? '' : 'opacity-50'}`}>
                      <td className="p-2 text-stone-500">{i + 1}</td>
                      <td className="p-2">{s.zipgradeId}</td>
                      <td className="p-2 whitespace-nowrap">{fullName(s)}</td>
                      <td className="p-2 text-right tabular-nums">{g ? g.assignmentTotal : '–'}</td>
                      <td className="p-2 text-right tabular-nums">{g ? g.examTotal : '–'}</td>
                      <td className="p-2 text-right tabular-nums">
                        {g ? (
                          <button type="button" className="font-bold text-board underline decoration-dotted" onClick={() => void toggleDetail(s.id)} aria-label={`ดูคะแนน ${fullName(s)}`}>
                            {g.total}
                          </button>
                        ) : (
                          '–'
                        )}
                      </td>
                      <td className="p-2">{g?.grade ?? '–'}</td>
                      <td className="p-2 text-right tabular-nums whitespace-nowrap" data-testid="student-exp">
                        {exp.get(s.id) ? (
                          <>
                            {exp.get(s.id)!.exp} <span className="text-xs text-stone-500">LV {exp.get(s.id)!.level}</span>
                          </>
                        ) : (
                          '–'
                        )}
                      </td>
                      <td className="p-2">{s.pinSet ? <Chip tone="green">ตั้งแล้ว</Chip> : <Chip>ยังไม่ตั้ง</Chip>}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1 items-center">
                          {!s.active && <Chip>ปิดใช้งาน</Chip>}
                          {s.locked && <Chip tone="red">ล็อกอยู่</Chip>}
                          {s.newDeviceSessionIds.length > 0 && (
                            <>
                              <Chip tone="amber">เครื่องใหม่</Chip>
                              <button type="button" className={small} onClick={() => Promise.all(s.newDeviceSessionIds.map((sid) => api(`/api/teacher/sessions/${sid}/ack`, { body: {} }))).then(load)}>
                                รับทราบ
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          {s.pinSet && (
                            <button type="button" className={small} onClick={() => act(`/api/teacher/students/${s.id}/reset-pin`, `รีเซ็ต PIN ของ ${fullName(s)}? นักเรียนจะต้องตั้ง PIN ใหม่`)}>
                              รีเซ็ต PIN
                            </button>
                          )}
                          {s.locked && (
                            <button type="button" className={small} onClick={() => act(`/api/teacher/students/${s.id}/unlock`)}>
                              ปลดล็อก
                            </button>
                          )}
                          <button type="button" className="rounded-lg border border-red-200 text-red-700 bg-white px-2 py-1 text-xs font-semibold whitespace-nowrap" onClick={() => void remove(s)}>
                            ลบ
                          </button>
                          {s.activeSessions > 0 && (
                            <button type="button" className={small} onClick={() => act(`/api/teacher/students/${s.id}/logout-all`, `ออกจากระบบทุกเครื่องของ ${fullName(s)}?`)}>
                              ออกจากระบบทุกเครื่อง
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {open === s.id && (
                      <tr className="bg-stone-50">
                        <td colSpan={11} className="p-3">
                          {!detail ? <Loading /> : <Breakdown studentId={s.id} detail={detail} />}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </TeacherLayout>
  )
}

/** เรียงตามรายชื่อ หรือคะแนนรวม (คนที่ไม่มีคะแนน/ปิดใช้งานอยู่ท้ายเสมอ) */
function sorted(rows: StudentAdminRow[], grades: ClassGrades | null, sort: Sort): { s: StudentAdminRow; g: Grade | undefined }[] {
  const by = new Map(grades?.students.map((g) => [g.id, g]))
  const list = rows.map((s) => ({ s, g: by.get(s.id) }))
  if (sort === 'roster') return list
  return list.sort((a, b) => {
    if (!a.g || !b.g) return a.g ? -1 : b.g ? 1 : 0
    return sort === 'desc' ? b.g.total - a.g.total : a.g.total - b.g.total
  })
}

function Breakdown({ studentId, detail }: { studentId: string; detail: { gb: Gradebook; book: ScoreBook } }) {
  const row = detail.gb.students.find((x) => x.id === studentId)
  const status = { missing: 'ยังไม่ส่ง', submitted: 'ส่งแล้ว รอตรวจ', late: 'ส่งช้า รอตรวจ', returned: 'ส่งกลับให้แก้', graded: '' } as const
  return (
    <div className="grid gap-4 sm:grid-cols-2 text-xs">
      <div>
        <p className="font-bold mb-1">งาน ({detail.gb.assignments.length})</p>
        {detail.gb.assignments.length === 0 && <p className="text-stone-500">ยังไม่มีงาน</p>}
        {detail.gb.assignments.map((a) => {
          const c = row?.cells[a.id]
          return (
            <div key={a.id} className="flex justify-between gap-2 border-b border-stone-200 py-0.5">
              <span>{a.title}</span>
              <span className={c?.status === 'graded' ? 'font-semibold' : c?.status === 'missing' ? 'text-red-700' : 'text-stone-500'}>
                {c?.status === 'graded' ? `${c.score ?? '–'}/${a.maxScore}` : status[c?.status ?? 'missing']}
              </span>
            </div>
          )
        })}
      </div>
      <div>
        <p className="font-bold mb-1">คะแนนสอบ ({detail.book.items.length})</p>
        {detail.book.items.length === 0 && <p className="text-stone-500">ยังไม่มีรายการสอบ</p>}
        {detail.book.items.map((it) => {
          const c = detail.book.cells[studentId]?.[it.id]
          return (
            <div key={it.id} className="flex justify-between gap-2 border-b border-stone-200 py-0.5">
              <span>{it.title}</span>
              <span className={c?.absent ? 'text-red-700' : 'font-semibold'}>{c?.absent ? 'ขาดสอบ' : c?.score != null ? `${c.score}/${it.maxScore}` : '–'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
