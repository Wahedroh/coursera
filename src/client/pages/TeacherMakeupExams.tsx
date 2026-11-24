import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api'
import { epochToLocal, localToEpoch } from '../lib/format'
import { downloadA4Pdf } from '../lib/pdf'
import { fileUrl } from '../lib/upload'
import { EXAM_LETTERS, leftText, MAKEUP_STATUS_LABEL, PROCTOR_KIND_LABEL, PROCTOR_RETENTION_DAYS, type ExamSetSummary, type MakeupStatus, type TeacherMakeupDetail, type TeacherMakeupRow, type TeacherMakeups } from '../../shared/makeupExam'
import Icon from '../components/Icon'
import ZipgradeSheet from '../components/ZipgradeSheet'
import { useFileViewer } from '../components/FileViewer'
import { Button, Card, Chip, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

const fmt = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const TONE: Record<MakeupStatus, 'amber' | 'blue' | 'green' | 'red' | 'gray' | 'purple'> = { pending: 'amber', approved: 'blue', in_progress: 'purple', submitted: 'amber', graded: 'green', rejected: 'red', expired: 'gray' }
const input = 'w-full border-2 border-line rounded-xl px-2 py-1 bg-white text-sm'

/** สอบย้อนหลัง: คำขอรออนุมัติ · กำลังสอบ · รอตรวจ · ขาดสอบที่ยังไม่ได้ขอ (ให้สิทธิ์เองได้) */
export default function TeacherMakeupExams() {
  const handle = useTeacherErrorHandler()
  const [d, setD] = useState<TeacherMakeups | null>(null)
  const [sets, setSets] = useState<ExamSetSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const load = useCallback(() => {
    api<TeacherMakeups>('/api/teacher/makeup-exams')
      .then(setD)
      .catch((e) => setError(handle(e)))
  }, [handle])
  useEffect(load, [load])
  useEffect(() => {
    api<ExamSetSummary[]>('/api/teacher/exam-sets')
      .then(setSets)
      .catch(() => {})
  }, [])
  const done = (msg: string) => (setFlash(msg), load())
  const now = Date.now()

  return (
    <TeacherLayout>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-extrabold">
          <Icon n="exam" /> สอบย้อนหลัง
        </h1>
        <Link to="/teacher/exam-sets" className="rounded-xl bg-board-soft px-3 py-1.5 text-sm font-bold text-board">
          <Icon n="books" /> ชุดข้อสอบ ({sets.length})
        </Link>
      </div>
      <p className="text-xs text-stone-500">ขาดสอบ → นักเรียนขอ (พร้อมเหตุผล) → ครูอนุมัติ + ตั้งเวลา/เพดานคะแนน/ชุดข้อสอบ → บอกรหัสเริ่มสอบ → ตรวจ → คะแนนลงช่องสอบเดิม · เลยกำหนดแล้วยังไม่ได้สอบ = 0 อัตโนมัติ</p>
      <ErrorBox message={error} />
      {flash && (
        <p className="rounded-xl bg-board-soft px-3 py-2 text-sm font-semibold text-board" role="status">
          {flash}
        </p>
      )}
      {!d && !error && <Loading />}
      {d && (
        <>
          <Section title={`รออนุมัติ (${d.pending.length})`} empty="ไม่มีคำขอรออนุมัติ">
            {d.pending.map((r) => (
              <Row key={r.id} r={r} now={now}>
                <ApproveForm r={r} sets={sets} onDone={done} onError={(e) => setError(handle(e))} />
              </Row>
            ))}
          </Section>
          <Section title={`รอตรวจ (${d.toReview.length})`} empty="ไม่มีงานรอตรวจ">
            {d.toReview.map((r) => (
              <Row key={r.id} r={r} now={now}>
                <Link to={`/teacher/makeup-exams/${r.id}`} className="self-start rounded-xl bg-board px-4 py-1.5 font-bold text-white">
                  ตรวจ · ให้คะแนน {r.autoScore !== null && `(อัตโนมัติ ${r.autoScore})`}
                </Link>
              </Row>
            ))}
          </Section>
          <Section title={`อนุมัติแล้ว / กำลังสอบ (${d.active.length})`} empty="—">
            {d.active.map((r) => (
              <Row key={r.id} r={r} now={now}>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  {r.mode === 'online' && r.code && (
                    <span data-testid={`code-${r.student.zipgradeId}`} className="rounded-xl bg-amber-100 px-3 py-1 font-extrabold tracking-widest text-amber-900">
                      🔑 {r.code}
                    </span>
                  )}
                  <span>
                    {r.mode === 'online' ? 'ออนไลน์' : 'ออนไซต์ (กระดาษ)'} · เริ่มได้ {r.opensAt && fmt.format(r.opensAt)} – {r.closesAt && fmt.format(r.closesAt)} · {r.durationMin} นาที · เพดาน {r.capPct}%{r.proctor ? ' · 📷 กล้อง' : ''}
                  </span>
                  <Link to={`/teacher/makeup-exams/${r.id}`} className="underline text-board">
                    {r.mode === 'paper' ? 'ใส่คะแนน' : 'ดูรายละเอียด'}
                  </Link>
                </div>
              </Row>
            ))}
          </Section>
          <Section title={`ขาดสอบ/ยังไม่มีคะแนน ยังไม่ได้ขอ (${d.absent.length})`} empty="ไม่มี">
            {d.absent.map((a) => (
              <Card key={`${a.item.id}-${a.student.id}`} className="p-3 flex flex-col gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{a.student.name}</b>
                  <span className="text-stone-500">
                    {a.className} · {a.item.title} ({dayFmt.format(Date.parse(`${a.item.takenOn}T00:00:00Z`))})
                  </span>
                  <span className="ml-auto">{a.blank && <Chip tone="blue">ยังไม่มีคะแนน</Chip>} {a.zeroed ? <Chip tone="red">หมดสิทธิ์ → ได้ 0</Chip> : a.deadline ? <Chip tone={a.deadline - now < 3 * 86400_000 ? 'red' : 'amber'}>เหลือ {leftText(a.deadline - now)}</Chip> : <Chip>ไม่เปิดสอบย้อนหลัง</Chip>}</span>
                </div>
                <ApproveForm grant={{ scoreItemId: a.item.id, studentId: a.student.id }} itemSetId={a.item.examSetId} deadline={a.deadline} sets={sets} onDone={done} onError={(e) => setError(handle(e))} label={a.zeroed ? 'คืนสิทธิ์สอบ' : 'ให้สิทธิ์สอบ'} />
              </Card>
            ))}
          </Section>
          {d.recent.length > 0 && (
            <Section title="ล่าสุด" empty="">
              {d.recent.map((r) => (
                <Link key={r.id} to={`/teacher/makeup-exams/${r.id}`} className="flex items-center gap-2 border-b border-stone-100 py-1.5 text-sm">
                  <b>{r.student.name}</b>
                  <span className="text-stone-500">{r.item.title}</span>
                  <span className="ml-auto">
                    <Chip tone={TONE[r.status]}>{MAKEUP_STATUS_LABEL[r.status]}</Chip>
                  </span>
                  {r.finalScore !== null && (
                    <b>
                      {r.finalScore}/{r.item.maxScore}
                    </b>
                  )}
                </Link>
              ))}
            </Section>
          )}
        </>
      )}
    </TeacherLayout>
  )
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const list = Array.isArray(children) ? children : [children]
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="font-bold">{title}</h2>
      {list.length ? children : empty && <p className="text-sm text-stone-500">{empty}</p>}
    </section>
  )
}

function Row({ r, now, children }: { r: TeacherMakeupRow; now: number; children: React.ReactNode }) {
  const fv = useFileViewer()
  return (
    <div data-testid={`mk-${r.student.zipgradeId}`}>
      <Card className="p-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <b>{r.student.name}</b>
          <span className="text-sm text-stone-500">
            {r.className} · {r.item.title} ({r.item.maxScore} คะแนน)
          </span>
          <span className="ml-auto flex gap-1">
            {r.leaves > 0 && <Chip tone="red">ออกจากหน้าจอ {r.leaves}</Chip>}
            <Chip tone={TONE[r.status]}>{MAKEUP_STATUS_LABEL[r.status]}</Chip>
          </span>
        </div>
        {r.status === 'pending' && (
          <p className="text-sm">
            <b>{r.mode === 'paper' ? 'ขอสอบออนไซต์' : 'ขอสอบออนไลน์'}</b> · “{r.reason}”{r.deadline && <span className="text-xs text-stone-500"> · สิทธิ์หมด {fmt.format(r.deadline)} (อีก {leftText(r.deadline - now)})</span>}
          </p>
        )}
        {r.imageKey && r.status === 'pending' && (
          <button type="button" onClick={() => fv.open({ key: r.imageKey!, title: `หลักฐานขอสอบย้อนหลัง · ${r.student.name}` })} className="self-start" aria-label="ดูหลักฐาน">
            <img src={fileUrl(r.imageKey)} alt="หลักฐาน" className="max-h-32 rounded border border-line" />
          </button>
        )}
        {fv.viewer}
        {children}
      </Card>
    </div>
  )
}

function ApproveForm({
  r,
  grant,
  itemSetId,
  deadline,
  sets,
  onDone,
  onError,
  label,
}: {
  r?: TeacherMakeupRow
  grant?: { scoreItemId: string; studentId: string }
  /** ชุดข้อสอบที่ครูเลือกไว้ในรายการสอบ (เลือกให้อัตโนมัติ) */
  itemSetId?: string | null
  deadline?: number | null
  sets: ExamSetSummary[]
  onDone: (msg: string) => void
  onError: (e: unknown) => void
  label?: string
}) {
  const [open, setOpen] = useState(!!r)
  const end = deadline ?? r?.deadline ?? null
  const now = Date.now()
  const [mode, setMode] = useState<'online' | 'paper'>(r?.mode ?? 'online')
  const [opensAt, setOpensAt] = useState(epochToLocal(now))
  const [closesAt, setClosesAt] = useState(epochToLocal(end && end > now ? Math.min(end, now + 3 * 86400_000) : now + 3 * 86400_000))
  const [duration, setDuration] = useState(30)
  const [cap, setCap] = useState(100)
  const preferred = r?.item.examSetId ?? itemSetId ?? null
  const [setId, setSetId] = useState(preferred ?? sets[0]?.id ?? '')
  const [shuffle, setShuffle] = useState(true)
  const [proctor, setProctor] = useState(true)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!setId && sets[0]) setSetId(sets.find((x) => x.id === preferred)?.id ?? sets[0].id)
  }, [sets, setId, preferred])
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start rounded-xl border-2 border-board px-3 py-1 text-sm font-bold text-board">
        {label ?? 'ให้สิทธิ์สอบ'}
      </button>
    )
  const chosen = sets.find((s) => s.id === setId)
  async function approve() {
    setBusy(true)
    try {
      const body = { mode, opensAt: localToEpoch(opensAt), closesAt: localToEpoch(closesAt), durationMin: duration, capPct: cap, examSetId: mode === 'online' ? setId || null : null, shuffle, proctor: mode === 'online' && proctor }
      const res = r ? await api<{ code: string }>(`/api/teacher/makeup-exams/${r.id}/approve`, { method: 'PUT', body }) : await api<{ code: string }>('/api/teacher/makeup-exams', { body: { ...body, ...grant } })
      onDone(mode === 'online' ? `อนุมัติแล้ว · รหัสเริ่มสอบ ${res.code} (บอกนักเรียนตอนนัดสอบ)` : 'อนุมัติแล้ว (สอบออนไซต์) · ใส่คะแนนหลังสอบ')
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }
  async function reject() {
    if (!r) return
    setBusy(true)
    try {
      await api(`/api/teacher/makeup-exams/${r.id}/reject`, { method: 'PUT', body: { note } })
      onDone('ไม่อนุมัติแล้ว')
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-2 rounded-xl bg-stone-50 p-3 text-sm sm:grid-cols-2">
      <div className="flex gap-2 sm:col-span-2" role="radiogroup" aria-label="รูปแบบสอบ">
        {(['online', 'paper'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`flex-1 rounded-xl border-2 py-1.5 font-bold ${mode === m ? 'border-board bg-board-soft text-board' : 'border-line bg-white'}`}>
            {m === 'online' ? 'ออนไลน์ (ระบบตรวจ)' : 'ออนไซต์ (กระดาษต่อหน้าครู)'}
          </button>
        ))}
      </div>
      <label>
        เริ่มสอบได้ตั้งแต่
        <input type="datetime-local" aria-label="เริ่มสอบได้ตั้งแต่" className={input} value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
      </label>
      <label>
        ถึง (เริ่มได้ไม่เกิน)
        <input type="datetime-local" aria-label="เริ่มสอบได้ถึง" className={input} value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
      </label>
      <label>
        เวลาทำ (นาที)
        <input type="number" aria-label="เวลาทำ (นาที)" min={5} max={240} className={input} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 30)} />
      </label>
      <label>
        เพดานคะแนน (% ของคะแนนเต็ม)
        <select aria-label="เพดานคะแนน" className={input} value={cap} onChange={(e) => setCap(Number(e.target.value))}>
          {[100, 90, 80, 70, 60, 50].map((p) => (
            <option key={p} value={p}>
              {p}%{p === 100 ? ' (เต็มเหมือนสอบจริง)' : ''}
            </option>
          ))}
        </select>
      </label>
      {mode === 'online' && (
        <>
          <label className="sm:col-span-2">
            ชุดข้อสอบ{' '}
            {sets.length ? (
              <select aria-label="ชุดข้อสอบ" className={input} value={setId} onChange={(e) => setSetId(e.target.value)}>
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.count} ข้อ · {s.kind === 'typed' ? 'พิมพ์ในระบบ' : 'PDF'})
                  </option>
                ))}
              </select>
            ) : (
              <Link to="/teacher/exam-sets" className="text-board underline">
                ยังไม่มีชุดข้อสอบ — สร้างก่อน
              </Link>
            )}
          </label>
          {chosen?.kind === 'typed' && (
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} /> สลับลำดับข้อและตัวเลือกให้นักเรียนคนนี้
            </label>
          )}
          <label className="flex items-start gap-2 sm:col-span-2">
            <input type="checkbox" className="mt-1" checked={proctor} onChange={(e) => setProctor(e.target.checked)} aria-label="คุมสอบด้วยกล้อง" />
            <span>
              📷 คุมสอบด้วยกล้อง <span className="text-xs text-stone-500">— กล้องหลังสแกนโต๊ะก่อนเริ่ม · กล้องหน้าถ่ายสุ่มระหว่างสอบ · สุ่มสแกนซ้ำ 1 ครั้ง · ลบภาพเองหลังให้คะแนน {PROCTOR_RETENTION_DAYS} วัน</span>
            </span>
          </label>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button onClick={() => void approve()} disabled={busy || (mode === 'online' && !setId)}>
          {r ? 'อนุมัติ' : (label ?? 'ให้สิทธิ์สอบ')}
        </Button>
        {r && (
          <>
            <input aria-label="เหตุผลที่ไม่อนุมัติ" placeholder="เหตุผล (ถ้าไม่อนุมัติ)" className="flex-1 min-w-32 rounded-xl border-2 border-line px-2 py-1" value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="button" disabled={busy} onClick={() => void reject()} className="rounded-xl border-2 border-red-300 px-3 py-1 font-bold text-red-700">
              ไม่อนุมัติ
            </button>
          </>
        )}
        {!r && (
          <button type="button" className="text-stone-500 underline" onClick={() => setOpen(false)}>
            ยกเลิก
          </button>
        )}
      </div>
    </div>
  )
}

const EVENT_LABEL: Record<string, string> = { start: 'เริ่มสอบ', leave: 'ออกจากหน้าสอบ', return: 'กลับมา', device: 'เปิดจากเครื่องอื่น', 'camera-off': 'กล้องปิด (นับเป็นออกจากหน้าสอบ)', submit: 'ส่งคำตอบ', 'auto-submit': 'ส่งอัตโนมัติ (ออกจากหน้าจอครบ)', timeout: 'หมดเวลา ระบบส่งให้' }

/** ตรวจรายคน: คำตอบเทียบเฉลย · บันทึกการสอบ · กระดาษ ZipGrade ที่ฝนแล้ว · ให้คะแนน */
export function TeacherMakeupExamDetail() {
  const { id = '' } = useParams()
  const handle = useTeacherErrorHandler()
  const [d, setD] = useState<TeacherMakeupDetail | null>(null)
  const [score, setScore] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const load = useCallback(() => {
    api<TeacherMakeupDetail>(`/api/teacher/makeup-exams/${id}`)
      .then((x) => {
        setD(x)
        setScore(String(x.finalScore ?? x.autoScore ?? x.graded?.capped ?? ''))
        setNote(x.teacherNote)
      })
      .catch((e) => setError(handle(e)))
  }, [id, handle])
  useEffect(load, [load])

  async function grade() {
    setError(null)
    try {
      await api(`/api/teacher/makeup-exams/${id}/grade`, { method: 'PUT', body: { score: Number(score), note } })
      setFlash('บันทึกคะแนนแล้ว · ลงช่องสอบเดิมในสมุดคะแนน')
      load()
    } catch (e) {
      setError(handle(e))
    }
  }

  return (
    <TeacherLayout>
      <Link to="/teacher/makeup-exams" className="text-sm text-stone-500">
        ← สอบย้อนหลัง
      </Link>
      <ErrorBox message={error} />
      {flash && (
        <p className="rounded-xl bg-board-soft px-3 py-2 text-sm font-semibold text-board" role="status">
          {flash}
        </p>
      )}
      {!d && !error && <Loading />}
      {d && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-auto text-2xl font-extrabold">
              {d.student.name} · {d.item.title}
            </h1>
            <Chip tone={TONE[d.status]}>{MAKEUP_STATUS_LABEL[d.status]}</Chip>
          </div>
          <p className="text-sm text-stone-500">
            {d.className} · {d.mode === 'online' ? `ออนไลน์ · ${d.examSet?.title ?? ''}` : 'ออนไซต์ (กระดาษ)'} · เพดาน {d.capPct}% · “{d.reason}”
          </p>
          <div className="grid gap-4 lg:grid-cols-2 items-start [&>*]:min-w-0">
            <Card className="p-4 flex flex-col gap-3">
              {d.graded && (
                <p className="text-lg" data-testid="auto-score">
                  ตรวจอัตโนมัติ: ถูก <b>{d.graded.correct}</b>/{d.graded.total} ข้อ = <b>{d.graded.raw}</b>
                  {d.graded.capped < d.graded.raw && <> → เพดาน {d.capPct}% = <b>{d.graded.capped}</b></>} / {d.item.maxScore}
                </p>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-sm font-semibold">
                  คะแนนที่บันทึก
                  <input aria-label="คะแนนสอบย้อนหลัง" inputMode="decimal" className="block w-28 rounded-xl border-2 border-line px-3 py-1.5 text-lg font-bold" value={score} onChange={(e) => setScore(e.target.value)} />
                </label>
                <span className="pb-2">/ {d.item.maxScore}</span>
                <input aria-label="หมายเหตุคะแนน" placeholder="หมายเหตุ (ไม่บังคับ)" className="flex-1 min-w-32 rounded-xl border-2 border-line px-3 py-1.5" value={note} onChange={(e) => setNote(e.target.value)} />
                <Button onClick={() => void grade()} disabled={score === '' || Number.isNaN(Number(score)) || d.status === 'pending'}>
                  บันทึกคะแนน
                </Button>
              </div>
              <div>
                <b className="text-sm">บันทึกการสอบ</b>
                {!d.events.length && <p className="text-sm text-stone-500">ยังไม่ได้เริ่มสอบ</p>}
                <ul className="text-sm" data-testid="exam-log">
                  {d.events.map((e, i) => (
                    <li key={i} className={['leave', 'device', 'auto-submit', 'camera-off'].includes(e.kind) ? 'text-red-700 font-semibold' : ''}>
                      {fmt.format(e.at)} · {EVENT_LABEL[e.kind] ?? e.kind}
                      {e.ms ? ` (${Math.round(e.ms / 1000)} วินาที)` : ''}
                    </li>
                  ))}
                </ul>
                {d.startedAt && d.submittedAt && <p className="text-xs text-stone-500">ใช้เวลา {Math.round((d.submittedAt - d.startedAt) / 60_000)} นาที</p>}
              </div>
              {d.key.length > 0 && d.startedAt && (
                <div className="grid grid-cols-5 gap-1 text-sm" aria-label="คำตอบเทียบเฉลย">
                  {d.key.map((k, i) => {
                    const a = d.answers[i] ?? -1
                    return (
                      <span key={i} className={`rounded-lg px-1.5 py-0.5 ${a === k ? 'bg-board-soft text-board' : 'bg-red-50 text-red-700'}`}>
                        {i + 1}. {a < 0 ? '–' : EXAM_LETTERS[a]}
                        {a !== k && <span className="text-xs"> ({EXAM_LETTERS[k]})</span>}
                      </span>
                    )
                  })}
                </div>
              )}
            </Card>
            {d.proctor && d.startedAt && <ProctorPhotos d={d} />}
            {d.startedAt && d.examSet && (
              <Card className="p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <b className="mr-auto">กระดาษคำตอบ ZipGrade (ฝนให้แล้ว)</b>
                  <Button variant="ghost" onClick={() => sheet.current && void downloadA4Pdf(sheet.current, `zipgrade-${d.student.zipgradeId}-${d.item.title}.pdf`)}>
                    <Icon n="download" /> PDF
                  </Button>
                </div>
                <div className="overflow-auto border border-line" style={{ maxHeight: '70vh' }}>
                  <div ref={sheet} style={{ zoom: 0.6 }}>
                    <ZipgradeSheet title={`${d.item.title} (สอบย้อนหลัง)`} name={d.student.name} className={d.className} zipgradeId={d.student.zipgradeId} answers={d.answers} choiceCount={d.examSet.choiceCount} note={d.submittedAt ? `ส่งเมื่อ ${fmt.format(d.submittedAt)}` : undefined} />
                  </div>
                </div>
              </Card>
            )}
          </div>
        </>
      )}
    </TeacherLayout>
  )
}

/** ภาพคุมสอบเรียงตามเวลา · ภาพแรกหลังกลับมาจากการออกจากหน้าจอมีกรอบแดง */
function ProctorPhotos({ d }: { d: TeacherMakeupDetail }) {
  const [big, setBig] = useState<string | null>(null)
  const returns = d.events.filter((e) => e.kind === 'return' || e.kind === 'camera-off').map((e) => e.at)
  const flagged = new Set(returns.map((t) => d.photos.find((p) => p.at >= t)?.key).filter(Boolean))
  const time = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return (
    <Card className="p-3 flex flex-col gap-2 lg:col-span-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <b className="mr-auto">📷 ภาพคุมสอบ ({d.photos.length})</b>
        {d.consentAt && <span className="text-xs text-board" data-testid="pdpa-consent">🔒 นักเรียนยินยอม PDPA เมื่อ {time.format(d.consentAt)}</span>}
        <span className="text-xs text-stone-500">เฉพาะครูดูได้ · ลบอัตโนมัติ {PROCTOR_RETENTION_DAYS} วันหลังให้คะแนน · กรอบแดง = ภาพแรกหลังออกจากหน้าจอ/กล้องปิด</span>
      </div>
      {!d.photos.length && <p className="text-sm text-red-700">ไม่มีภาพจากกล้อง</p>}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8" data-testid="proctor-photos">
        {d.photos.map((p) => (
          <button key={p.key} type="button" onClick={() => setBig(p.key)} className={`flex flex-col overflow-hidden rounded-lg border-2 text-left text-[11px] ${flagged.has(p.key) ? 'border-red-500' : p.kind === 'face' ? 'border-line' : 'border-amber-400'}`}>
            <img src={fileUrl(p.key)} alt={`${PROCTOR_KIND_LABEL[p.kind]} ${time.format(p.at)}`} loading="lazy" className="aspect-[3/4] w-full bg-stone-100 object-cover" />
            <span className="px-1 py-0.5">
              {time.format(p.at)} · {PROCTOR_KIND_LABEL[p.kind]}
            </span>
          </button>
        ))}
      </div>
      {big && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setBig(null)} role="dialog" aria-label="ภาพคุมสอบ">
          <img src={fileUrl(big)} alt="ภาพคุมสอบขนาดใหญ่" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </Card>
  )
}
