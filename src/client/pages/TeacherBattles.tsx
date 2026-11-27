import { useEffect, useState } from 'react'
import { api } from '../api'
import type { ExamBattle } from '../../shared/battle'
import ExamBattleCard from '../components/ExamBattleCard'
import { Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type School = { schoolId: string; schoolName: string; classes: { id: string; name: string }[] }

/** ศึกสอบระหว่างห้อง/โรงเรียน (ข้อสอบชุดเดียวกัน) + เปิด/ปิดรายห้อง */
export default function TeacherBattles() {
  const handle = useTeacherErrorHandler()
  const [list, setList] = useState<ExamBattle[] | null>(null)
  const [schools, setSchools] = useState<School[]>([])
  const [on, setOn] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const load = () =>
    api<ExamBattle[]>('/api/teacher/battles')
      .then(setList)
      .catch((e) => setError(handle(e)))
  useEffect(() => {
    let live = true
    void load()
    api<School[]>('/api/teacher/classes')
      .then(async (s) => {
        if (!live) return
        setSchools(s)
        const ids = s.flatMap((x) => x.classes.map((c) => c.id))
        const vals = await Promise.all(ids.map((id) => api<{ enabled: boolean }>(`/api/teacher/classes/${id}/settings/battle`).then((r) => [id, r.enabled] as const)))
        if (live) setOn(Object.fromEntries(vals))
      })
      .catch((e) => live && setError(handle(e)))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  async function toggle(id: string, v: boolean) {
    setOn((x) => ({ ...x, [id]: v }))
    try {
      await api(`/api/teacher/classes/${id}/settings/battle`, { method: 'PUT', body: { enabled: v } })
      void load()
    } catch (e) {
      setError(handle(e))
    }
  }
  return (
    <TeacherLayout>
      <h1 className="text-2xl font-extrabold">⚔️ ศึกสอบ</h1>
      <p className="text-sm text-stone-500 -mt-2">ห้องที่สอบข้อสอบชุดเดียวกัน (ชื่อรายการ + คะแนนเต็มเท่ากัน · เผยแพร่คะแนนแล้ว · มีคะแนนอย่างน้อย 3 คน) จะขึ้นอันดับเทียบกันอัตโนมัติ — นักเรียนเห็นในหน้าคะแนนสอบ · ไม่แสดงข้อมูลรายคน</p>
      <ErrorBox message={error} />
      {!list && !error && <Loading />}
      {list?.length === 0 && <Card className="p-6 text-center text-stone-500">ยังไม่มีศึกสอบเทอมนี้ — ใช้ “คลังของครู” คัดลอกรายการสอบเดียวกันไปหลายห้อง แล้วเผยแพร่คะแนน</Card>}
      <div className="grid gap-3 lg:grid-cols-2 items-start">
        {list?.map((b) => (
          <ExamBattleCard key={b.key} b={b} />
        ))}
      </div>
      <Card className="p-4 flex flex-col gap-2">
        <b>ห้องที่เข้าร่วมศึกสอบ</b>
        {schools.map((s) => (
          <div key={s.schoolId} className="flex flex-col gap-1 border-t border-stone-100 pt-2">
            <span className="text-xs text-stone-500">{s.schoolName}</span>
            {s.classes.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={on[c.id] ?? true} onChange={(e) => void toggle(c.id, e.target.checked)} aria-label={`เข้าร่วมศึกสอบ ${c.name}`} />
                {c.name}
              </label>
            ))}
          </div>
        ))}
      </Card>
    </TeacherLayout>
  )
}
