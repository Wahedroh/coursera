import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { WEEKDAY_SHORT } from '../../shared/timetable'
import { CLOSURE_LABEL, type WorkloadRange, type WorkloadTargets } from '../../shared/workload'
import { Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

const input = 'border-2 border-line rounded-lg px-2 py-1 bg-white text-sm'
const todayStr = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
const monthRange = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` }
}
const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}
const monthLabel = (ym: string) => new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${ym}-01`))

/** ภาระสอน: เป้าคาบ/สัปดาห์เทียบตารางสอน · คาบที่สอนและการเดินทางรายวัน/รายเดือน (หักวันที่ปิด) */
export default function TeacherWorkload() {
  const handle = useTeacherErrorHandler()
  const [error, setError] = useState<string | null>(null)
  const [targets, setTargets] = useState<WorkloadTargets | null>(null)
  const [month, setMonth] = useState(todayStr().slice(0, 7))
  const [range, setRange] = useState<WorkloadRange | null>(null)

  const loadTargets = useCallback(() => api<WorkloadTargets>('/api/teacher/workload/targets').then(setTargets).catch((e) => setError(handle(e))), [handle])
  useEffect(() => void loadTargets(), [loadTargets])
  useEffect(() => {
    const { from, to } = monthRange(month)
    setRange(null)
    api<WorkloadRange>(`/api/teacher/workload?from=${from}&to=${to}`)
      .then(setRange)
      .catch((e) => setError(handle(e)))
  }, [month, handle])

  async function setTarget(classId: string, raw: string) {
    const v = raw.trim() === '' ? null : Number(raw)
    if (v !== null && (!Number.isInteger(v) || v < 0)) return
    try {
      await api(`/api/teacher/classes/${classId}/weekly-periods`, { method: 'PUT', body: { weeklyPeriods: v } })
      void loadTargets()
    } catch (e) {
      setError(handle(e))
    }
  }
  async function setCounting(schoolId: string, v: { countPeriods: boolean; countTrips: boolean }) {
    try {
      await api(`/api/teacher/schools/${schoolId}/counting`, { method: 'PUT', body: v })
      void loadTargets()
      const { from, to } = monthRange(month)
      api<WorkloadRange>(`/api/teacher/workload?from=${from}&to=${to}`)
        .then(setRange)
        .catch((e) => setError(handle(e)))
    } catch (e) {
      setError(handle(e))
    }
  }
  async function setSlot(slotId: string, raw: string) {
    try {
      await api(`/api/teacher/timetable/${slotId}/periods`, { method: 'PUT', body: { periods: raw === '' ? null : Number(raw) } })
      void loadTargets()
    } catch (e) {
      setError(handle(e))
    }
  }

  function downloadCsv() {
    if (!range) return
    const rows = [['วันที่', 'วัน', 'สถานที่ (ตามลำดับ)', 'คาบที่สอน', 'คาบที่งด (ปิด)', 'การเดินทาง (ครั้ง)', 'หมายเหตุการปิด']]
    for (const d of range.days) {
      if (!d.stops.length) continue
      rows.push([
        d.date,
        WEEKDAY_SHORT[d.weekday],
        d.stops.map((s) => `${s.name}${s.kind === 'school' ? ` ${s.periods} คาบ` : ''}${s.closed ? ' (ปิด)' : ''}`).join(' → '),
        String(d.periods),
        String(d.closedPeriods),
        String(d.trips),
        [...new Set(d.stops.filter((s) => s.closed).map((s) => `${s.name}: ${CLOSURE_LABEL[s.closed!.reason]}${s.closed!.note ? ` ${s.closed!.note}` : ''}`))].join(' · '),
      ])
    }
    rows.push(['รวม', '', '', String(range.planned.periods), String(range.planned.closedPeriods), String(range.planned.trips), ''])
    const csv = '﻿' + rows.map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `ภาระสอน-${month}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const status = (target: number | null, scheduled: number) =>
    target === null ? <span className="text-stone-400">ยังไม่ตั้งเป้า</span> : scheduled === target ? <b className="text-green-700">✓ ครบ</b> : scheduled < target ? <b className="text-red-700">ขาด {target - scheduled}</b> : <b className="text-amber-700">เกิน {scheduled - target}</b>

  return (
    <TeacherLayout>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-extrabold mr-auto">📊 ภาระสอน & การเดินทาง</h1>
        <Link to="/teacher/route" className="rounded-xl bg-board-soft text-board px-3 py-1.5 text-sm font-bold">
          🧭 เส้นทาง · ปิดโรงเรียน
        </Link>
      </div>
      <ErrorBox message={error} />
      <div className="grid gap-4 xl:grid-cols-2 items-start">
        <Card className="p-4">
          <b>ต่อสัปดาห์: เป้าคาบ vs ตารางสอน</b>
          <p className="text-xs text-stone-500 pb-2">ใส่เป้าคาบของแต่ละห้อง · คาบในตารางคิดช่วงละ 50 นาที (เลือกจำนวนคาบเองได้ที่แต่ละช่วง)</p>
          {!targets && <Loading />}
          {targets && (
            <table className="w-full text-sm" data-testid="targets">
              <thead>
                <tr className="text-left text-stone-500 border-b-2 border-stone-100">
                  <th className="py-1.5 pr-2 font-semibold">โรงเรียน / ห้อง</th>
                  <th className="py-1.5 px-2 font-semibold text-right">เป้า</th>
                  <th className="py-1.5 px-2 font-semibold text-right">ในตาราง</th>
                  <th className="py-1.5 pl-2 font-semibold">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {targets.schools.map((s) => (
                  <SchoolRows key={s.id} s={s} status={status} setTarget={setTarget} setSlot={setSlot} setCounting={setCounting} />
                ))}
                <tr className="border-t-2 border-stone-200 font-extrabold">
                  <td className="py-2 pr-2">รวม (เฉพาะที่นับคาบ)</td>
                  <td className="py-2 px-2 text-right tabular-nums">{targets.target}</td>
                  <td className="py-2 px-2 text-right tabular-nums" data-testid="scheduled-total">
                    {targets.scheduled}
                  </td>
                  <td className="py-2 pl-2 whitespace-nowrap">{status(targets.target || null, targets.scheduled)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="เดือนก่อน" className="rounded-lg bg-board-soft text-board px-2.5 py-1 font-bold" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
              ‹
            </button>
            <b className="min-w-36 text-center" data-testid="month-label">
              {monthLabel(month)}
            </b>
            <button type="button" aria-label="เดือนถัดไป" className="rounded-lg bg-board-soft text-board px-2.5 py-1 font-bold" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
              ›
            </button>
            <button type="button" className="ml-auto rounded-lg border-2 border-line px-2.5 py-1 text-sm font-bold" onClick={downloadCsv} disabled={!range}>
              ⬇ Excel (CSV)
            </button>
          </div>
          {!range && <Loading />}
          {range && (
            <>
              <div className="grid grid-cols-3 gap-2" data-testid="month-totals">
                <div className="rounded-xl bg-board-soft p-2.5">
                  <span className="text-xs">สอนแล้ว{range.to > range.today ? ' (ถึงวันนี้)' : ''}</span>
                  <b className="block text-2xl tabular-nums">{range.done.periods} คาบ</b>
                  {range.to > range.today && <span className="text-xs text-stone-500">ทั้งเดือนตามแผน {range.planned.periods}</span>}
                </div>
                <div className="rounded-xl bg-amber-50 p-2.5">
                  <span className="text-xs">เดินทาง{range.to > range.today ? ' (ถึงวันนี้)' : ''}</span>
                  <b className="block text-2xl tabular-nums">{range.done.trips} ครั้ง</b>
                  {range.to > range.today && <span className="text-xs text-stone-500">ทั้งเดือนตามแผน {range.planned.trips}</span>}
                </div>
                <div className="rounded-xl bg-rose-50 p-2.5">
                  <span className="text-xs">งดสอน (ปิด)</span>
                  <b className="block text-2xl tabular-nums">{range.planned.closedPeriods} คาบ</b>
                </div>
              </div>
              {range.bySchool.length > 0 && (
                <p className="text-xs text-stone-600">
                  แยกโรงเรียน (ถึงวันนี้): {range.bySchool.map((s) => `${s.name} ${s.periods} คาบ/${s.trips} ครั้ง`).join(' · ')}
                </p>
              )}
              <ul className="flex flex-col" data-testid="month-days">
                {range.days
                  .filter((d) => d.stops.length)
                  .map((d) => (
                    <li key={d.date} className={`flex flex-wrap items-center gap-1.5 border-t border-stone-100 py-1.5 text-sm ${d.date > range.today ? 'opacity-60' : ''} ${d.date === range.today ? 'bg-amber-50 -mx-2 px-2 rounded-lg' : ''}`}>
                      <span className="w-16 font-bold">
                        {WEEKDAY_SHORT[d.weekday]} {Number(d.date.slice(8))}
                      </span>
                      {d.stops.map((s, i) => (
                        <span key={i} className="inline-flex items-center gap-1">
                          {i > 0 && <span className="text-stone-300">→</span>}
                          <span
                            className={`rounded-lg px-2 py-0.5 text-xs font-bold ${s.closed ? 'bg-rose-100 text-rose-800 line-through' : s.kind === 'school' ? (s.countPeriods || s.countTrips ? 'bg-board-soft text-board' : 'bg-stone-100 text-stone-500') : 'bg-blue-50 text-blue-800'}`}
                            title={s.kind === 'school' && (!s.countPeriods || !s.countTrips) ? [!s.countPeriods && 'ไม่นับคาบ', !s.countTrips && 'ไม่นับการเดินทาง'].filter(Boolean).join(' · ') : undefined}
                          >
                            {s.kind === 'appointment' ? '📍 ' : ''}
                            {s.name}
                            {s.kind === 'school' ? (s.countPeriods ? ` ${s.periods}` : ' (ไม่นับคาบ)') : ''}
                            {s.kind === 'school' && !s.countTrips ? ' 🚫🚗' : ''}
                          </span>
                          {s.closed && <span className="text-[11px] text-rose-700">ปิด: {CLOSURE_LABEL[s.closed.reason]}{s.closed.note ? ` · ${s.closed.note}` : ''}</span>}
                        </span>
                      ))}
                      <span className="ml-auto font-extrabold tabular-nums">🚗 {d.trips}</span>
                    </li>
                  ))}
              </ul>
              <p className="text-xs text-stone-500">นับการเดินทาง = ย้ายไปอีกที่ 1 ครั้ง (เช้า ดรุณ + บ่าย บำรุง = 2 · ไป-กลับที่เดิมในวันเดียวนับทุกเที่ยว) · ที่ปิดไม่นับ · 🚫🚗 = โรงเรียนที่ตั้งไม่นับการเดินทาง · คิดจากตารางสอนปัจจุบัน</p>
            </>
          )}
        </Card>
      </div>
    </TeacherLayout>
  )
}

function SchoolRows({
  s,
  status,
  setTarget,
  setSlot,
  setCounting,
}: {
  s: WorkloadTargets['schools'][number]
  status: (t: number | null, n: number) => React.ReactNode
  setTarget: (id: string, v: string) => void
  setSlot: (id: string, v: string) => void
  setCounting: (id: string, v: { countPeriods: boolean; countTrips: boolean }) => void
}) {
  const flags = { countPeriods: s.countPeriods, countTrips: s.countTrips }
  return (
    <>
      <tr className={`bg-stone-50 font-extrabold ${s.countPeriods ? '' : 'text-stone-400'}`}>
        <td className="py-1.5 pr-2">
          {s.name}
          <div className="flex flex-wrap gap-3 pt-0.5 text-[11px] font-semibold text-stone-600">
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={s.countPeriods} onChange={(e) => setCounting(s.id, { ...flags, countPeriods: e.target.checked })} aria-label={`นับคาบ ${s.name}`} />
              นับคาบ
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={s.countTrips} onChange={(e) => setCounting(s.id, { ...flags, countTrips: e.target.checked })} aria-label={`นับการเดินทาง ${s.name}`} />
              นับการเดินทาง
            </label>
          </div>
        </td>
        <td className="py-1.5 px-2 text-right tabular-nums">{s.target}</td>
        <td className="py-1.5 px-2 text-right tabular-nums">{s.scheduled}</td>
        <td className="py-1.5 pl-2 whitespace-nowrap">{s.countPeriods ? status(s.classes.some((c) => c.target !== null) ? s.target : null, s.scheduled) : <span className="text-stone-400 font-semibold">ไม่นับในรวม</span>}</td>
      </tr>
      {s.classes.map((c) => (
        <tr key={c.id} className="border-b border-stone-100 align-top">
          <td className="py-1.5 pr-2 pl-3">
            {c.name}
            <div className="flex flex-wrap gap-1 pt-1">
              {c.slots.map((x) => (
                <label key={x.id} className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px]">
                  {WEEKDAY_SHORT[x.weekday]} {x.start}–{x.end}
                  <select aria-label={`จำนวนคาบ ${c.name} ${WEEKDAY_SHORT[x.weekday]} ${x.start}`} className="bg-transparent font-bold" value={x.custom ? String(x.periods) : ''} onChange={(e) => setSlot(x.id, e.target.value)}>
                    <option value="">{x.custom ? 'อัตโนมัติ' : `${x.periods} คาบ (อัตโนมัติ)`}</option>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n} คาบ
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {!c.slots.length && <span className="text-[11px] text-stone-400">ยังไม่มีในตารางสอน</span>}
            </div>
          </td>
          <td className="py-1.5 px-2 text-right">
            <input
              type="number"
              min={0}
              max={60}
              aria-label={`เป้าคาบต่อสัปดาห์ ${c.name}`}
              className={`${input} w-16 text-right`}
              defaultValue={c.target ?? ''}
              key={`${c.id}:${c.target}`}
              onBlur={(e) => e.target.value !== String(c.target ?? '') && setTarget(c.id, e.target.value)}
            />
          </td>
          <td className="py-1.5 px-2 text-right tabular-nums">{c.scheduled}</td>
          <td className="py-1.5 pl-2 whitespace-nowrap">{status(c.target, c.scheduled)}</td>
        </tr>
      ))}
    </>
  )
}
