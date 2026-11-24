import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api'
import { localToEpoch } from '../lib/format'
import { absencesLeft, MIN_ATTENDANCE_PCT, REMEDIAL_STATUS_LABEL, RISK_DESC, RISK_LABEL, RISK_REASONS, type AtRisk, type AtRiskStudent, type RemedialItem, type RiskReason } from '../../shared/remedial'
import Icon from '../components/Icon'
import { fileUrl } from '../lib/upload'
import { useFileViewer } from '../components/FileViewer'
import { Button, Card, Chip, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

const RESULT_GRADES = ['1', '1.5', '2', '2.5', '3', '3.5', '4']
const TONE = { assigned: 'gray', submitted: 'amber', returned: 'purple', passed: 'green' } as const
const FLAG_TONE: Record<RiskReason, 'red' | 'amber' | 'purple'> = { attendance: 'red', incomplete: 'amber', zero: 'purple' }

/** เฝ้าระวังนักเรียนติด 0 / ร / มส ของห้อง + สั่งและตรวจงานซ่อมเฉพาะคน */
export default function TeacherAtRisk() {
  const { id = '' } = useParams()
  const handle = useTeacherErrorHandler()
  const [data, setData] = useState<AtRisk | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [filter, setFilter] = useState<RiskReason | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    api<AtRisk>(`/api/teacher/classes/${id}/at-risk`)
      .then(setData)
      .catch((e) => setError(handle(e)))
  }, [id, handle])
  useEffect(load, [load])

  const list = useMemo(() => (data?.students ?? []).filter((s) => !filter || s.flags.includes(filter)), [data, filter])
  const count = (f: RiskReason) => data?.students.filter((s) => s.flags.includes(f)).length ?? 0
  const toggle = (sid: string) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(sid)) n.delete(sid)
      else n.add(sid)
      return n
    })

  async function exportExcel() {
    if (!data) return
    const { exportAtRisk } = await import('../lib/excel')
    await exportAtRisk(data)
  }

  return (
    <TeacherLayout>
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <Link to={`/teacher/classes/${id}`} className="text-sm text-stone-500">
            ← {data?.class.name ?? 'ห้องเรียน'}
          </Link>
          <h1 className="text-2xl font-extrabold">
            <Icon n="warning" /> เฝ้าระวัง 0 · ร · มส
          </h1>
        </div>
        <Button variant="ghost" onClick={() => void exportExcel()} disabled={!data?.students.length}>
          <Icon n="download" /> Excel ส่งฝ่ายวัดผล
        </Button>
      </div>
      <p className="text-xs text-stone-500">
        มส = เวลาเรียนต่ำกว่า {MIN_ATTENDANCE_PCT}% (ขาดเท่านั้นที่ลดเวลาเรียน · ป่วย/ลาไม่นับขาด) · ร = งานที่เลยกำหนดแต่ยังไม่ส่ง/ส่งกลับให้แก้ · 0 = เกรดคาดการณ์ตอนนี้เป็น 0 · นับเฉพาะเทอมนี้
      </p>
      <ErrorBox message={error} />
      {flash && (
        <p className="rounded-xl bg-board-soft text-board px-3 py-2 text-sm font-semibold" role="status">
          {flash}
        </p>
      )}
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="กรอง">
            <FilterBtn on={filter === null} onClick={() => setFilter(null)} label={`ทั้งหมด (${data.students.length})`} />
            {RISK_REASONS.slice()
              .reverse()
              .map((f) => (
                <FilterBtn key={f} on={filter === f} onClick={() => setFilter(filter === f ? null : f)} label={`${RISK_LABEL[f]} · ${RISK_DESC[f]} (${count(f)})`} />
              ))}
          </div>
          {!data.students.length && <Card className="p-6 text-center text-stone-500">🎉 ไม่มีนักเรียนติด 0 / ร / มส ในห้องนี้ ({data.total} คน)</Card>}
          {picked.size > 0 && (
            <NewRemedial
              classId={id}
              students={data.students.filter((s) => picked.has(s.id))}
              onDone={(n) => {
                setFlash(`สั่งงานซ่อมให้ ${n} คนแล้ว · นักเรียนได้รับแจ้งเตือน`)
                setPicked(new Set())
                load()
              }}
              onError={(e) => setError(handle(e))}
            />
          )}
          <div className="flex flex-col gap-2">
            {list.map((s) => (
              <StudentRow key={s.id} s={s} picked={picked.has(s.id)} onPick={() => toggle(s.id)} onChanged={(msg) => (setFlash(msg), load())} onError={(e) => setError(handle(e))} />
            ))}
          </div>
        </>
      )}
    </TeacherLayout>
  )
}

function FilterBtn({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${on ? 'bg-board text-white' : 'bg-white border border-line'}`}>
      {label}
    </button>
  )
}

function StudentRow({ s, picked, onPick, onChanged, onError }: { s: AtRiskStudent; picked: boolean; onPick: () => void; onChanged: (msg: string) => void; onError: (e: unknown) => void }) {
  const left = absencesLeft(s.attendance.days, s.attendance.absent)
  return (
    <div data-testid={`risk-${s.zipgradeId}`}>
      <Card className="p-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input type="checkbox" checked={picked} onChange={onPick} aria-label={`เลือก ${s.name}`} className="h-5 w-5 accent-[var(--color-board)]" />
          <b>{s.name}</b>
          <span className="text-xs text-stone-500">#{s.zipgradeId}</span>
          {s.flags.map((f) => (
            <Chip key={f} tone={FLAG_TONE[f]}>
              {RISK_LABEL[f]}
            </Chip>
          ))}
        </div>
        <div className="grid sm:grid-cols-3 gap-1 text-sm">
          <span className={s.flags.includes('attendance') ? 'text-red-700 font-semibold' : ''}>
            <Icon n="check" /> มาเรียน {s.attendance.pct ?? '–'}% (ขาด {s.attendance.absent}/{s.attendance.days}){!s.flags.includes('attendance') && s.attendance.days > 0 && <span className="text-xs text-stone-500"> · ขาดได้อีก {left}</span>}
          </span>
          <span className={s.flags.includes('incomplete') ? 'text-amber-800 font-semibold' : ''} title={s.incomplete.titles.join(', ')}>
            <Icon n="task" /> ค้าง {s.incomplete.count} งาน{s.incomplete.count > 0 && <span className="font-normal text-xs"> · {s.incomplete.titles.slice(0, 3).join(', ')}{s.incomplete.count > 3 ? '…' : ''}</span>}
          </span>
          <span className={s.flags.includes('zero') ? 'text-violet-700 font-semibold' : ''}>
            <Icon n="chart" /> เกรดตอนนี้ {s.grade ?? '–'}
          </span>
        </div>
        {s.remedials.map((r) => (
          <RemedialBox key={r.id} r={r} name={s.name} onChanged={onChanged} onError={onError} />
        ))}
      </Card>
    </div>
  )
}

function RemedialBox({ r, name, onChanged, onError }: { r: RemedialItem; name: string; onChanged: (msg: string) => void; onError: (e: unknown) => void }) {
  const [grade, setGrade] = useState(r.resultGrade ?? '1')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const fv = useFileViewer()
  async function decide(pass: boolean) {
    setBusy(true)
    try {
      await api(`/api/teacher/remedials/${r.id}/decision`, { method: 'PUT', body: { pass, resultGrade: pass ? grade : null, comment } })
      onChanged(pass ? `งานซ่อมของ ${name} ผ่านแล้ว · ผลหลังซ่อม ${grade}` : `ส่งงานซ่อมกลับให้ ${name} แก้`)
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    if (!window.confirm(`ลบงานซ่อม “${r.title}” ของ ${name}?`)) return
    try {
      await api(`/api/teacher/remedials/${r.id}`, { method: 'DELETE' })
      onChanged(`ลบงานซ่อมของ ${name} แล้ว`)
    } catch (e) {
      onError(e)
    }
  }
  return (
    <div className="rounded-xl bg-stone-50 border border-line p-2.5 text-sm flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <b>
          <Icon n="edit" /> งานซ่อม ({RISK_LABEL[r.reason]}): {r.title}
        </b>
        <Chip tone={TONE[r.status]}>{REMEDIAL_STATUS_LABEL[r.status]}</Chip>
        {r.resultGrade && <Chip tone="green">ผลหลังซ่อม {r.resultGrade}</Chip>}
        <button type="button" onClick={() => void remove()} className="ml-auto text-xs text-stone-500 underline">
          ลบ
        </button>
      </div>
      {(r.text || r.imageKeys.length > 0) && (
        <div className="rounded-lg bg-white border border-line p-2">
          {r.text && <p className="whitespace-pre-wrap">{r.text}</p>}
          <div className="flex flex-wrap gap-1.5 mt-1">
            {r.imageKeys.map((k) => (
              <button key={k} type="button" onClick={() => fv.open({ key: k, title: `งานซ่อม · ${name}` })} aria-label="ดูรูปงานซ่อม">
                <img src={fileUrl(k)} alt="รูปงานซ่อม" className="h-20 rounded border border-line" />
              </button>
            ))}
          </div>
          {fv.viewer}
        </div>
      )}
      {r.status === 'submitted' && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold">
            ผลหลังซ่อม{' '}
            <select aria-label={`ผลหลังซ่อม ${name}`} value={grade} onChange={(e) => setGrade(e.target.value)} className="rounded-lg border border-line px-2 py-1">
              {RESULT_GRADES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <input aria-label={`ความเห็นงานซ่อม ${name}`} placeholder="ความเห็นถึงนักเรียน" value={comment} onChange={(e) => setComment(e.target.value)} className="flex-1 min-w-32 rounded-lg border border-line px-2 py-1" />
          <button type="button" disabled={busy} onClick={() => void decide(true)} className="rounded-lg bg-board text-white px-3 py-1 font-bold">
            ผ่าน
          </button>
          <button type="button" disabled={busy} onClick={() => void decide(false)} className="rounded-lg border border-violet-300 text-violet-700 px-3 py-1 font-bold">
            ส่งกลับให้แก้
          </button>
        </div>
      )}
      {r.comment && <p className="text-xs text-stone-500">ความเห็นครู: {r.comment}</p>}
    </div>
  )
}

function NewRemedial({ classId, students, onDone, onError }: { classId: string; students: AtRiskStudent[]; onDone: (n: number) => void; onError: (e: unknown) => void }) {
  const first = students[0]?.flags[0] ?? 'zero'
  const [reason, setReason] = useState<RiskReason>(first)
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      const r = await api<{ created: number }>('/api/teacher/remedials', { body: { classId, studentIds: students.map((s) => s.id), reason, title, instructions, dueAt: due ? localToEpoch(due) : null } })
      setTitle('')
      setInstructions('')
      onDone(r.created)
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }
  const input = 'w-full rounded-xl border-2 border-line bg-white px-3 py-1.5'
  return (
    <Card className="p-4 flex flex-col gap-2 border-amber-300 bg-amber-50/50">
      <h2 className="font-bold">
        <Icon n="plus" /> สั่งงานซ่อมให้ {students.length} คน: <span className="font-normal text-sm">{students.map((s) => s.name).join(', ')}</span>
      </h2>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-xs font-semibold">
          ซ่อมเรื่อง
          <select aria-label="ซ่อมเรื่อง" value={reason} onChange={(e) => setReason(e.target.value as RiskReason)} className={input}>
            {RISK_REASONS.map((f) => (
              <option key={f} value={f}>
                {RISK_LABEL[f]} · {RISK_DESC[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold flex-1 min-w-48">
          ชื่องานซ่อม
          <input aria-label="ชื่องานซ่อม" className={input} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น แบบฝึกหัดซ่อม บทที่ 1–3" />
        </label>
        <label className="text-xs font-semibold">
          กำหนดส่ง
          <input type="datetime-local" aria-label="กำหนดส่งงานซ่อม" className={input} value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      </div>
      <textarea aria-label="รายละเอียดงานซ่อม" className={input} rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="รายละเอียด/สิ่งที่ต้องทำ" />
      <Button onClick={save} disabled={busy || !title.trim()} className="self-start">
        {busy ? 'กำลังสั่ง…' : 'สั่งงานซ่อม'}
      </Button>
    </Card>
  )
}
