import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, fullName } from '../api'
import type { StudentAdminRow } from '../../server/roster/service'
import { Card, Chip, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type Data = { class: { id: string; name: string; joinCode: string }; students: StudentAdminRow[] }

const small = 'rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold whitespace-nowrap'

export default function TeacherClass() {
  const { id } = useParams()
  const handle = useTeacherErrorHandler()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api<Data>(`/api/teacher/classes/${id}/students`)
      .then(setData)
      .catch((e) => setError(handle(e)))
  }, [id, handle])

  useEffect(load, [load])

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
            <div className="flex flex-wrap gap-2">
              <Link to={`/teacher/classes/${data.class.id}/gradebook`} className="rounded-2xl bg-board text-white px-4 py-2 font-bold">
                ตารางทวงงาน
              </Link>
              <Link to={`/teacher/assignments/new?classId=${data.class.id}`} className="rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold">
                + สร้างงาน
              </Link>
              <Link to={`/teacher/classes/${data.class.id}/attendance`} className="rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold">
                เช็กชื่อ
              </Link>
              <Link to={`/teacher/classes/${data.class.id}/seating`} className="rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold">
                ผังห้อง & แต้ม
              </Link>
              <Link to={`/teacher/classes/${data.class.id}/scores`} className="rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold">
                คะแนนสอบ
              </Link>
              <Link to={`/teacher/classes/${data.class.id}/grades`} className="rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold">
                เกรด
              </Link>
              <Link to={`/teacher/classes/${data.class.id}/videos`} className="rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold">
                คลิปย้อนหลัง
              </Link>
              <Link to={`/teacher/classes/${data.class.id}/materials`} className="rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold">
                เอกสารเรียน
              </Link>
              <Link to={`/teacher/classes/${data.class.id}/fees`} className="rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold">
                ค่าเอกสาร
              </Link>
            </div>
            <div className="text-right">
              <div className="text-xs text-stone-500">รหัสห้อง</div>
              <div className="text-xl font-extrabold tracking-[0.3em]">{data.class.joinCode}</div>
            </div>
          </div>
          <Card className="p-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-500">
                  <th className="p-2">#</th>
                  <th className="p-2">ZipGrade ID</th>
                  <th className="p-2">ชื่อ</th>
                  <th className="p-2">PIN</th>
                  <th className="p-2">สถานะ</th>
                  <th className="p-2">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s, i) => (
                  <tr key={s.id} className={`border-t border-stone-100 ${s.active ? '' : 'opacity-50'}`}>
                    <td className="p-2 text-stone-500">{i + 1}</td>
                    <td className="p-2">{s.zipgradeId}</td>
                    <td className="p-2 whitespace-nowrap">{fullName(s)}</td>
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
                        {s.activeSessions > 0 && (
                          <button type="button" className={small} onClick={() => act(`/api/teacher/students/${s.id}/logout-all`, `ออกจากระบบทุกเครื่องของ ${fullName(s)}?`)}>
                            ออกจากระบบทุกเครื่อง
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </TeacherLayout>
  )
}
