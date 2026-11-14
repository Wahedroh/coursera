import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api'
import { CLASS_MENU } from '../components/ClassMenu'
import type { Overview, OverviewItem } from '../../shared/overview'
import { Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type School = { schoolId: string; schoolName: string; classes: { id: string; name: string; grade: number | null; studentCount: number }[] }

const DOT: Record<NonNullable<OverviewItem['tone']>, string> = {
  green: 'bg-board',
  amber: 'bg-amber-400',
  red: 'bg-red-500',
  gray: 'bg-stone-300',
  purple: 'bg-violet-500',
  blue: 'bg-blue-500',
}

/** เมนูครูแบบรวมทุกห้อง: แยกโรงเรียน → ชั้น เหมือนหน้าแรก · แตะห้องเพื่อเข้าไปจัดการ */
export default function TeacherOverview() {
  const { kind = '' } = useParams()
  const handle = useTeacherErrorHandler()
  const menu = CLASS_MENU.find((m) => m.kind === kind)
  const [schools, setSchools] = useState<School[] | null>(null)
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<School[]>('/api/teacher/classes')
      .then(setSchools)
      .catch((e) => setError(handle(e)))
  }, [handle])
  useEffect(() => {
    setData(null)
    if (!menu) return
    api<Overview>(`/api/teacher/overview/${kind}`)
      .then(setData)
      .catch((e) => setError(handle(e)))
  }, [kind, menu, handle])

  if (!menu)
    return (
      <TeacherLayout>
        <ErrorBox message="ไม่พบเมนูนี้" />
      </TeacherLayout>
    )
  const byId = new Map(data?.classes.map((c) => [c.classId, c]))

  return (
    <TeacherLayout>
      <Link to="/teacher" className="text-sm text-stone-500">
        ← หน้าแรก
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">{menu.label}</h1>
          <p className="text-sm text-stone-500">ทุกห้อง แยกโรงเรียน/ชั้น · แตะห้องเพื่อเข้าไปจัดการ</p>
        </div>
        {menu.all && (
          <Link to={menu.all.to} className="rounded-2xl bg-board text-white px-4 py-2 font-bold">
            {menu.all.label}
          </Link>
        )}
      </div>
      <nav aria-label="เมนูครู" className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {CLASS_MENU.map((m) => (
          <Link
            key={m.kind}
            to={`/teacher/menu/${m.kind}`}
            aria-current={m.kind === kind ? 'page' : undefined}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold ${m.kind === kind ? 'bg-board text-white' : 'bg-white border border-line text-stone-600'}`}
          >
            {m.label}
          </Link>
        ))}
      </nav>
      <ErrorBox message={error} />
      {(!schools || !data) && !error && <Loading />}
      {schools &&
        data &&
        schools.map((s) => (
          <section key={s.schoolId} className="flex flex-col gap-2" data-testid={`overview-school-${s.schoolName}`}>
            <h2 className="font-bold text-lg">{s.schoolName}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {s.classes.map((c) => {
                const o = byId.get(c.id)
                const label = c.grade !== null ? `ชั้น ${c.grade}` : c.name
                return (
                  <Card key={c.id} className="p-0 overflow-hidden flex flex-col">
                    <Link to={menu.path(c.id)} aria-label={`${menu.label} ${c.name}`} className="flex items-baseline justify-between gap-2 px-4 py-3 bg-board-soft hover:bg-green-100">
                      <b className="text-board">{label}</b>
                      <span className="text-xs text-stone-500">{c.studentCount} คน · เปิด →</span>
                    </Link>
                    <div className="px-4 py-3 flex flex-col gap-2 text-sm">
                      {o?.stat && <p className="font-semibold text-stone-700">{o.stat}</p>}
                      {o && o.items.length > 0 && (
                        <ul className="flex flex-col divide-y divide-stone-100" data-testid={`overview-items-${c.name}`}>
                          {o.items.map((it, i) => (
                            <li key={i}>
                              <Link to={menu.path(c.id)} className="flex gap-2 items-start py-1.5">
                                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[it.tone ?? 'gray']}`} aria-hidden />
                                <span className="min-w-0">
                                  <span className="block font-semibold truncate">{it.title}</span>
                                  <span className="block text-xs text-stone-500">{it.meta}</span>
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                      {o && o.more > 0 && (
                        <Link to={menu.path(c.id)} className="text-xs text-board underline">
                          อีก {o.more} รายการ →
                        </Link>
                      )}
                      {o && !o.stat && o.items.length === 0 && <p className="text-xs text-stone-400">{menu.empty ?? 'แตะเพื่อเปิดห้องนี้'}</p>}
                    </div>
                  </Card>
                )
              })}
            </div>
          </section>
        ))}
    </TeacherLayout>
  )
}
