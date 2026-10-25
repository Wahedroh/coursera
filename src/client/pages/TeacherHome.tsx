import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type School = {
  schoolId: string
  schoolName: string
  classes: { id: string; name: string; grade: number | null; joinCode: string; studentCount: number; pinSetCount: number }[]
}

export default function TeacherHome() {
  const handle = useTeacherErrorHandler()
  const [schools, setSchools] = useState<School[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<School[]>('/api/teacher/classes')
      .then(setSchools)
      .catch((e) => setError(handle(e)))
  }, [handle])

  const total = schools?.reduce((n, s) => n + s.classes.reduce((m, c) => m + c.studentCount, 0), 0) ?? 0
  const pinSet = schools?.reduce((n, s) => n + s.classes.reduce((m, c) => m + c.pinSetCount, 0), 0) ?? 0
  const classCount = schools?.reduce((n, s) => n + s.classes.length, 0) ?? 0

  return (
    <TeacherLayout>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">สวัสดีครับครู 👋</h1>
          {schools && (
            <p className="text-sm text-stone-500">
              {schools.length} โรงเรียน · {classCount} ห้อง · {total} คน · ตั้ง PIN แล้ว {pinSet}/{total}
            </p>
          )}
        </div>
        <Link to="/teacher/import" className="rounded-2xl border-2 border-line bg-white px-4 py-2.5 font-bold">
          นำเข้ารายชื่อ
        </Link>
      </div>
      <ErrorBox message={error} />
      {!schools && !error && <Loading />}
      {schools && schools.length === 0 && (
        <Card className="p-6 text-center">
          <p className="font-bold">ยังไม่มีรายชื่อนักเรียน</p>
          <p className="text-sm text-stone-500">เริ่มจากนำเข้าไฟล์ CSV ที่ export จาก ZipGrade</p>
        </Card>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {schools?.map((s) => (
          <Card key={s.schoolId} className="p-4">
            <div className="flex justify-between items-baseline">
              <h2 className="font-bold">{s.schoolName}</h2>
              <span className="text-xs text-stone-500">{s.classes.length} ห้อง</span>
            </div>
            {s.classes.map((c) => (
              <Link key={c.id} to={`/teacher/classes/${c.id}`} aria-label={c.name} className="block border-t border-stone-100 mt-3 pt-3">
                <div className="flex justify-between items-baseline">
                  <b>{c.grade !== null ? `ชั้น ${c.grade}` : c.name}</b>
                  <span className="text-xs text-stone-500 tracking-widest">{c.joinCode}</span>
                </div>
                <div className="text-xs text-stone-500 mt-1">
                  {c.studentCount} คน · PIN {c.pinSetCount}/{c.studentCount}
                </div>
                <div className="h-1.5 rounded-full bg-line mt-1.5 overflow-hidden">
                  <div className="h-full bg-board" style={{ width: `${c.studentCount ? (c.pinSetCount / c.studentCount) * 100 : 0}%` }} />
                </div>
              </Link>
            ))}
          </Card>
        ))}
      </div>
    </TeacherLayout>
  )
}
