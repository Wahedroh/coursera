import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { currentSubscription, disablePush, enablePush, isIos, isStandalone, pushSupported } from '../lib/pwa'
import type { TeacherInbox, TeacherNotifySettings } from '../../shared/teacherNotify'
import { Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

const BASE = '/api/teacher/push'
const when = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const input = 'border-2 border-line rounded-lg px-2 py-1 bg-white text-sm'

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-green-500' : 'bg-stone-300'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? 'right-0.5' : 'left-0.5'}`} />
    </button>
  )
}

/** แจ้งเตือนของครู: เปิดในเครื่องนี้ · ตั้งค่าทีละเรื่อง · รายการย้อนหลัง */
export default function TeacherNotifications() {
  const handle = useTeacherErrorHandler()
  const [s, setS] = useState<TeacherNotifySettings | null>(null)
  const [inbox, setInbox] = useState<TeacherInbox | null>(null)
  const [device, setDevice] = useState<'on' | 'off' | 'unsupported'>('off')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(() => {
    api<TeacherNotifySettings>('/api/teacher/notify-settings').then(setS).catch((e) => setError(handle(e)))
    api<TeacherInbox>('/api/teacher/notifications')
      .then((r) => {
        setInbox(r)
        if (r.unread) void api('/api/teacher/notifications/read', { body: {} })
      })
      .catch((e) => setError(handle(e)))
  }, [handle])
  useEffect(load, [load])
  useEffect(() => {
    if (!pushSupported()) setDevice('unsupported')
    else void currentSubscription().then((sub) => setDevice(sub && Notification.permission === 'granted' ? 'on' : 'off'))
  }, [])

  async function save(next: TeacherNotifySettings) {
    setS(next)
    setSaved(false)
    try {
      await api('/api/teacher/notify-settings', { method: 'PUT', body: next })
      setSaved(true)
    } catch (e) {
      setError(handle(e))
    }
  }
  async function toggleDevice() {
    setError(null)
    try {
      if (device === 'on') {
        await disablePush(BASE)
        setDevice('off')
      } else {
        const r = await enablePush(BASE)
        if (r === 'denied') setError('เครื่องนี้ไม่อนุญาตแจ้งเตือน — เปิดในการตั้งค่าของเบราว์เซอร์/iPad แล้วลองใหม่')
        setDevice(r === 'on' ? 'on' : r === 'unsupported' ? 'unsupported' : 'off')
      }
    } catch (e) {
      setError(handle(e))
    }
  }

  const row = (label: string, desc: string, on: boolean, set: (v: boolean) => void, extra?: React.ReactNode) => (
    <div className="flex items-center gap-3 border-t border-stone-100 py-2.5">
      <Toggle on={on} onChange={set} label={label} />
      <div className="flex-1 min-w-0">
        <b className="text-sm">{label}</b>
        <div className="text-xs text-stone-500">{desc}</div>
      </div>
      {extra}
    </div>
  )

  return (
    <TeacherLayout>
      <h1 className="text-2xl font-extrabold">🔔 แจ้งเตือน</h1>
      <ErrorBox message={error} />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px] items-start">
        <Card className="p-4 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <b>แจ้งเตือนบนเครื่องนี้</b>
            {device === 'unsupported' ? (
              <span className="text-xs text-amber-700">{isIos() && !isStandalone() ? 'iPad/iPhone: กดแชร์ → “เพิ่มไปยังหน้าจอโฮม” แล้วเปิดจากไอคอนก่อน' : 'เบราว์เซอร์นี้ไม่รองรับ'}</span>
            ) : (
              <button type="button" onClick={() => void toggleDevice()} className={`rounded-xl px-3 py-1.5 text-sm font-bold ${device === 'on' ? 'bg-board-soft text-board' : 'bg-board text-white'}`} data-testid="teacher-push-toggle">
                {device === 'on' ? 'เปิดในเครื่องนี้แล้ว ✓ (แตะเพื่อปิด)' : 'เปิดแจ้งเตือนในเครื่องนี้'}
              </button>
            )}
          </div>
          <p className="text-xs text-stone-500 pb-2">เปิดได้หลายเครื่อง (มือถือ + iPad) · ข้อความไม่มีชื่อนักเรียน (บอกแค่จำนวน)</p>
          {!s && <Loading />}
          {s && (
            <div data-testid="notify-settings">
              {row('⏰ ก่อนเข้าคาบ', 'จากตารางสอน', s.beforeClass.on, (on) => void save({ ...s, beforeClass: { ...s.beforeClass, on } }),
                <select aria-label="เตือนก่อนเข้าคาบกี่นาที" className={input} value={s.beforeClass.minutes} onChange={(e) => void save({ ...s, beforeClass: { ...s.beforeClass, minutes: Number(e.target.value) } })}>
                  {[5, 10, 15, 30].map((m) => (
                    <option key={m} value={m}>
                      {m} นาที
                    </option>
                  ))}
                </select>,
              )}
              {row('📸 ยืนยันการสอน (เซลฟี + พิกัด)', 'เตือนตอนเริ่มคาบ แตะแล้วเปิดลิงก์ยืนยัน · กด “ยืนยันแล้ว” บนการ์ดกำลังสอนเพื่อหยุดเตือน', s.selfie.on, (on) => void save({ ...s, selfie: { ...s.selfie, on } }))}
              {s.selfie.on && (
                <label className="flex items-center gap-2 pb-2 pl-14 text-xs">
                  ลิงก์
                  <input
                    aria-label="ลิงก์ยืนยันการสอน"
                    className={`${input} flex-1`}
                    defaultValue={s.selfie.url}
                    onBlur={(e) => e.target.value.trim() !== s.selfie.url && void save({ ...s, selfie: { ...s.selfie, url: e.target.value.trim() } })}
                  />
                </label>
              )}
              {row('📋 ลืมเช็กชื่อ', 'หลังจบคาบแล้วยังไม่เปิดเช็กชื่อ', s.missedAttendance.on, (on) => void save({ ...s, missedAttendance: { ...s.missedAttendance, on } }),
                <select aria-label="เตือนลืมเช็กชื่อหลังจบคาบกี่นาที" className={input} value={s.missedAttendance.afterMinutes} onChange={(e) => void save({ ...s, missedAttendance: { ...s.missedAttendance, afterMinutes: Number(e.target.value) } })}>
                  {[15, 30, 60].map((m) => (
                    <option key={m} value={m}>
                      {m} นาทีหลังจบ
                    </option>
                  ))}
                </select>,
              )}
              {row('✅ สรุปงานรอตรวจ', 'วันละครั้ง (ข้ามถ้าไม่มีงานรอ)', s.toGrade.on, (on) => void save({ ...s, toGrade: { ...s.toGrade, on } }),
                <input type="time" aria-label="เวลาสรุปงานรอตรวจ" className={input} value={s.toGrade.at} onChange={(e) => e.target.value && void save({ ...s, toGrade: { ...s.toGrade, at: e.target.value } })} />,
              )}
              {row('↩️ นักเรียนส่งแก้แล้ว', 'งานที่ครูส่งกลับให้แก้ ถูกส่งใหม่', s.resubmitted.on, (on) => void save({ ...s, resubmitted: { on } }))}
              {row('📮 ครบกำหนดแล้วยังค้าง', 'สรุปจำนวนคนค้างเมื่อถึงกำหนดส่ง', s.overdue.on, (on) => void save({ ...s, overdue: { on } }))}
              {row('📣 เผยแพร่ตามเวลาแล้ว', 'งาน/คลิป/เอกสาร/ประกาศที่ตั้งเวลาไว้ ขึ้นให้นักเรียนแล้ว', s.released.on, (on) => void save({ ...s, released: { on } }))}
              {row('🌙 ช่วงห้ามรบกวน', 'ไม่ส่งช่วงนี้ เก็บไว้ส่งเมื่อพ้นช่วง', s.quiet.on, (on) => void save({ ...s, quiet: { ...s.quiet, on } }),
                <span className="flex items-center gap-1 text-xs">
                  <input type="time" aria-label="ห้ามรบกวนตั้งแต่" className={input} value={s.quiet.from} onChange={(e) => e.target.value && void save({ ...s, quiet: { ...s.quiet, from: e.target.value } })} />–
                  <input type="time" aria-label="ห้ามรบกวนถึง" className={input} value={s.quiet.to} onChange={(e) => e.target.value && void save({ ...s, quiet: { ...s.quiet, to: e.target.value } })} />
                </span>,
              )}
              {saved && <p className="text-xs text-board font-semibold pt-1">บันทึกแล้ว ✓</p>}
              <p className="text-xs text-stone-500 pt-2">
                ก่อนเข้าคาบ/ลืมเช็กชื่อ/ยืนยันการสอน ใช้ <Link to="/teacher/timetable" className="underline text-board">ตารางสอน</Link> · ระบบตรวจทุก 5 นาที
              </p>
            </div>
          )}
        </Card>
        <Card className="p-4">
          <b>ล่าสุด</b>
          {!inbox && <Loading />}
          {inbox?.items.length === 0 && <p className="text-sm text-stone-500 py-4 text-center">ยังไม่มีแจ้งเตือน</p>}
          <ul className="flex flex-col" data-testid="teacher-inbox">
            {inbox?.items.map((n) => {
              const external = /^https?:\/\//.test(n.url)
              const body = (
                <>
                  <b className="block">{n.title}</b>
                  {n.body && <span className="block text-xs text-stone-600">{n.body}</span>}
                  <span className="block text-xs text-stone-400">{when.format(n.createdAt)}</span>
                </>
              )
              return (
                <li key={n.id} className={`border-t border-stone-100 py-2 text-sm ${n.read ? '' : 'bg-board-soft/60 -mx-2 px-2 rounded-lg'}`}>
                  {external ? (
                    <a href={n.url} target="_blank" rel="noreferrer">
                      {body}
                    </a>
                  ) : (
                    <Link to={n.url}>{body}</Link>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      </div>
    </TeacherLayout>
  )
}
