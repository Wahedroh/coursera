import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { StudentAssignment, StudentStatus } from '../../shared/assignments'
import { formatDue, timeLeft } from '../lib/format'
import { Chip } from '../ui'

export type SheetTab = 'pending' | 'submitted' | 'graded' | 'returned'
const TAB_OF: Record<StudentStatus, SheetTab> = { missing: 'pending', submitted: 'submitted', late: 'submitted', graded: 'graded', returned: 'returned' }
const TABS: [SheetTab, string][] = [
  ['pending', 'ค้างส่ง'],
  ['submitted', 'ส่งแล้ว'],
  ['graded', 'ตรวจแล้ว'],
  ['returned', 'แก้'],
]
const isTab = (v: string | null): v is SheetTab => v === 'pending' || v === 'submitted' || v === 'graded' || v === 'returned'
const LAST_TAB = 'sheet-tab'
const readLast = (): SheetTab => {
  try {
    const v = localStorage.getItem(LAST_TAB)
    return isTab(v) ? v : 'pending'
  } catch {
    return 'pending'
  }
}

const when = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** งานค้าง: ใกล้กำหนดก่อน (ไม่มีกำหนดไว้ท้าย) · แยกงานที่เลยกำหนด */
export function sortPending(items: StudentAssignment[], now = Date.now()) {
  const byDue = (a: StudentAssignment, b: StudentAssignment) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)
  const open = items.filter((a) => a.dueAt === null || a.dueAt >= now).sort(byDue)
  const overdue = items.filter((a) => a.dueAt !== null && a.dueAt < now).sort((a, b) => b.dueAt! - a.dueAt!)
  return { open, overdue }
}

/**
 * Bottom sheet "งานของฉัน": แถบ peek ติดล่างจอ แตะ/ปัดขึ้นเพื่อเปิด (ครึ่งจอ → เต็มจอ)
 * สถานะเปิดอยู่ใน URL (?sheet=แท็บ) จึงปิดด้วยปุ่มย้อนกลับของมือถือได้ และลิงก์แจ้งเตือนเปิดแท็บตรง ๆ ได้
 */
export default function AssignmentSheet({ items }: { items: StudentAssignment[] | null }) {
  const [params, setParams] = useSearchParams()
  const param = params.get('sheet')
  const open = isTab(param)
  const tab: SheetTab = open ? param : readLast()
  const [full, setFull] = useState(false)
  const [drag, setDrag] = useState(0)
  const [entered, setEntered] = useState(false)
  const pushed = useRef(false)
  const start = useRef<number | null>(null)
  const dialog = useRef<HTMLDivElement>(null)

  const counts = { pending: 0, submitted: 0, graded: 0, returned: 0 }
  for (const a of items ?? []) counts[TAB_OF[a.status]]++
  const owed = counts.pending + counts.returned
  const now = Date.now()
  const { open: upcoming, overdue } = sortPending((items ?? []).filter((a) => a.status === 'missing'), now)
  const next = upcoming[0] ?? overdue[0]

  function show(t: SheetTab = tab) {
    pushed.current = true
    setParams((p) => {
      p.set('sheet', t)
      return p
    })
  }
  function close() {
    if (pushed.current) {
      pushed.current = false
      history.back()
    } else {
      setParams(
        (p) => {
          p.delete('sheet')
          return p
        },
        { replace: true },
      )
    }
  }
  function pick(t: SheetTab) {
    try {
      localStorage.setItem(LAST_TAB, t)
    } catch {
      /* ไม่เป็นไร */
    }
    setParams(
      (p) => {
        p.set('sheet', t)
        return p
      },
      { replace: true },
    )
  }

  useEffect(() => {
    if (!open) {
      setEntered(false)
      setFull(false)
      return
    }
    const id = requestAnimationFrame(() => setEntered(true))
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(id)
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ปัดลากด้วยนิ้ว: ขึ้น = เต็มจอ · ลง = ครึ่งจอ/ปิด
  const onDown = (e: React.PointerEvent) => {
    start.current = e.clientY
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => start.current !== null && setDrag(e.clientY - start.current)
  const onUp = () => {
    if (start.current === null) return
    start.current = null
    if (drag < -60) setFull(true)
    else if (drag > 80) full ? setFull(false) : close()
    setDrag(0)
  }

  const list = (items ?? []).filter((a) => TAB_OF[a.status] === tab)

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => show()}
          onPointerDown={(e) => (start.current = e.clientY)}
          onPointerUp={(e) => {
            if (start.current !== null && start.current - e.clientY > 30) show()
            start.current = null
          }}
          aria-label={`งานของฉัน · ค้าง ${owed} · ส่งแล้ว ${counts.submitted + counts.graded}`}
          data-testid="sheet-peek"
          className={`fixed bottom-0 inset-x-0 z-30 mx-auto max-w-md rounded-t-3xl bg-white px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] text-left shadow-[0_-6px_24px_rgba(0,0,0,0.15)] ${overdue.length ? 'ring-2 ring-red-300' : ''}`}
        >
          <span className="mx-auto mb-2 block h-1.5 w-11 rounded-full bg-stone-300" aria-hidden />
          <span className="flex items-center gap-2">
            <span className="text-xl" aria-hidden>
              📋
            </span>
            <b className="flex-1">งานของฉัน</b>
            <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${owed ? 'bg-red-100 text-red-700' : 'bg-stone-100 text-stone-500'}`}>ค้าง {owed}</span>
            <span className="rounded-full bg-board-soft px-2.5 py-0.5 text-sm font-bold text-board">ส่งแล้ว {counts.submitted + counts.graded}</span>
          </span>
          {next ? (
            <span className={`mt-1 block truncate text-xs ${overdue.length ? 'text-red-700' : 'text-stone-500'}`}>
              {overdue.length ? `⚠️ เลยกำหนด ${overdue.length} งาน · ${overdue[0].title}` : `⏰ ${next.title} · ${formatDue(next.dueAt)}`}
            </span>
          ) : counts.returned ? (
            <span className="mt-1 block text-xs text-violet-700">↩ ครูส่งกลับให้แก้ {counts.returned} งาน</span>
          ) : (
            <span className="mt-1 block text-xs text-stone-500">{items ? '🎉 ไม่มีงานค้าง' : 'กำลังโหลด…'}</span>
          )}
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-40">
          <div className={`absolute inset-0 bg-black/45 transition-opacity duration-200 ${entered ? 'opacity-100' : 'opacity-0'}`} onClick={close} aria-hidden data-testid="sheet-backdrop" />
          <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-label="งานของฉัน"
            tabIndex={-1}
            className="absolute bottom-0 inset-x-0 mx-auto flex max-w-md flex-col rounded-t-3xl bg-white outline-none transition-[transform,height] duration-200 ease-out"
            style={{ height: full ? '92dvh' : '62dvh', transform: entered ? `translateY(${Math.max(drag, full ? 0 : -9999)}px)` : 'translateY(100%)', transitionDuration: drag ? '0ms' : undefined }}
          >
            <div className="touch-none cursor-grab px-4 pt-2" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
              <span className="mx-auto mb-2 block h-1.5 w-11 rounded-full bg-stone-300" aria-hidden />
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-extrabold">งานของฉัน</h2>
                <button type="button" onClick={close} onPointerDown={(e) => e.stopPropagation()} aria-label="ปิด" className="h-8 w-8 rounded-full border border-stone-300 text-stone-500">
                  ✕
                </button>
              </div>
              <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-stone-100 p-1" role="tablist" onPointerDown={(e) => e.stopPropagation()}>
                {TABS.map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => pick(k)} className={`rounded-lg py-1.5 text-sm font-semibold ${tab === k ? 'bg-white text-board shadow-sm' : 'text-stone-500'}`}>
                    {label} {counts[k]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onScroll={(e) => !full && e.currentTarget.scrollTop > 40 && setFull(true)}>
              {!items && <p className="py-6 text-center text-sm text-stone-500">กำลังโหลด…</p>}
              {items && list.length === 0 && <p className="py-6 text-center text-sm text-stone-500">{tab === 'pending' ? '🎉 ไม่มีงานค้าง' : 'ไม่มีงานในหมวดนี้'}</p>}
              {tab === 'pending' ? (
                <>
                  {upcoming.map((a) => (
                    <Row key={a.id} a={a} now={now} />
                  ))}
                  {overdue.length > 0 && <p className="mx-0.5 mt-3 mb-1.5 text-xs font-bold text-stone-500">เลยกำหนดแล้ว (ยังส่งได้ แต่นับว่าส่งช้า)</p>}
                  {overdue.map((a) => (
                    <Row key={a.id} a={a} now={now} />
                  ))}
                </>
              ) : (
                [...list].sort((a, b) => (b.submission?.submittedAt ?? 0) - (a.submission?.submittedAt ?? 0)).map((a) => <Row key={a.id} a={a} now={now} />)
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Row({ a, now }: { a: StudentAssignment; now: number }) {
  const s = a.submission
  const left = a.status === 'missing' ? timeLeft(a.dueAt, now) : null
  const overdue = a.status === 'missing' && a.dueAt !== null && a.dueAt < now
  const icon =
    a.status === 'missing' ? (overdue ? ['⌛', 'bg-stone-100'] : left?.tone === 'red' ? ['⏰', 'bg-red-100'] : ['📝', 'bg-amber-100']) : a.status === 'graded' ? ['⭐', 'bg-board-soft'] : a.status === 'returned' ? ['↩', 'bg-violet-100 text-violet-700'] : ['✓', a.status === 'late' ? 'bg-amber-100 text-amber-800' : 'bg-board-soft text-board']
  const sub =
    a.status === 'missing'
      ? [overdue ? 'เลยกำหนดแล้ว' : left?.label ?? 'ไม่มีกำหนดส่ง', `${a.maxScore} คะแนน`].join(' · ')
      : a.status === 'graded'
        ? s?.comment
          ? `“${s.comment}”`
          : 'ครูตรวจแล้ว'
        : a.status === 'returned'
          ? `ครูส่งกลับให้แก้${s?.comment ? `: “${s.comment}”` : ''}`
          : s?.onPaper
            ? 'ครูบันทึกว่าส่งในห้อง · รอครูตรวจ'
            : `ส่ง ${s ? when.format(s.submittedAt) : ''} · รอครูตรวจ`
  return (
    <Link to={`/me/assignments/${a.id}`} className="mb-1.5 flex items-center gap-3 rounded-2xl border border-stone-200 p-2.5 active:bg-stone-50">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold ${icon[1]}`} aria-hidden>
        {icon[0]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{a.title}</span>
        <span className={`block truncate text-xs ${a.status === 'returned' ? 'text-violet-700' : 'text-stone-500'}`}>{sub}</span>
      </span>
      {a.status === 'missing' && <span className="text-sm font-extrabold text-board">ส่ง ›</span>}
      {a.status === 'returned' && <span className="text-sm font-extrabold text-violet-700">แก้ ›</span>}
      {a.status === 'graded' && <Chip tone="green">{s?.score !== null && s?.score !== undefined ? `${s.score}/${a.maxScore}` : 'ตรวจแล้ว'}</Chip>}
      {(a.status === 'submitted' || a.status === 'late') && (s?.onPaper ? <Chip>กระดาษ</Chip> : a.status === 'late' ? <Chip tone="amber">ส่งช้า</Chip> : <Chip tone="green">ตรงเวลา</Chip>)}
    </Link>
  )
}
