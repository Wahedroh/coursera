import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../api'
import BarChart from '../components/BarChart'
import type { ClassCompare, ClassInsights } from '../../shared/insights'
import type { Term } from '../../shared/terms'
import { formatDue } from '../lib/format'
import { Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

/** สีกราฟ (ตรวจด้วย validate_palette แล้ว: แยกได้สำหรับคนตาบอดสี) — ข้อความใช้สีตัวอักษรปกติเสมอ */
const GREEN = '#1E8A5E'
const AMBER = '#D98E1C'
const TRACK = '#E7E2D8'
const pctTxt = (v: number | null) => (v === null ? '–' : `${v}%`)
const shortDate = (d: string) => new Date(`${d}T12:00:00+07:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })

type School = { schoolId: string; schoolName: string; classes: { id: string; name: string }[] }

export default function TeacherInsights() {
  const handle = useTeacherErrorHandler()
  const [params, setParams] = useSearchParams()
  const [schools, setSchools] = useState<School[] | null>(null)
  const [terms, setTerms] = useState<Term[]>([])
  const [cmp, setCmp] = useState<ClassCompare | null>(null)
  const [x, setX] = useState<ClassInsights | null>(null)
  const [exam, setExam] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const classId = params.get('class') ?? ''
  const termId = params.get('term') ?? ''

  useEffect(() => {
    api<School[]>('/api/teacher/classes')
      .then((s) => {
        setSchools(s)
        if (!classId && s[0]?.classes[0]) setParams({ class: s[0].classes[0].id }, { replace: true })
      })
      .catch((e) => setError(handle(e)))
    api<Term[]>('/api/teacher/terms').then(setTerms).catch(() => {})
    api<ClassCompare>('/api/teacher/insights').then(setCmp).catch(() => {})
  }, [handle])

  useEffect(() => {
    if (!classId) return
    setX(null)
    api<ClassInsights>(`/api/teacher/classes/${classId}/insights${termId ? `?term=${termId}` : ''}`)
      .then((d) => {
        setX(d)
        setExam(d.exams[d.exams.length - 1]?.id ?? null)
      })
      .catch((e) => setError(handle(e)))
  }, [classId, termId, handle])

  const pick = (k: 'class' | 'term', v: string) => setParams((p) => (v ? p.set(k, v) : p.delete(k), p), { replace: true })
  const sel = 'border-2 border-line rounded-xl px-3 py-1.5 bg-white font-semibold'
  const selExam = x?.exams.find((e) => e.id === exam)

  return (
    <TeacherLayout>
      <h1 className="text-2xl font-extrabold">กราฟห้องเรียน</h1>
      <ErrorBox message={error} />
      {cmp && cmp.classes.length > 1 && (
        <Card className="p-4 flex flex-col gap-2">
          <h2 className="font-bold">เทียบทุกห้อง · เทอม {cmp.term}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="compare-table">
              <thead>
                <tr className="text-left text-stone-500 text-xs">
                  <th className="py-1 pr-3">ห้อง</th>
                  <th className="py-1 pr-3">มาเรียน</th>
                  <th className="py-1 pr-3">ส่งงาน (ที่เลยกำหนดแล้ว)</th>
                  <th className="py-1 pr-3">คะแนนสอบเฉลี่ย</th>
                </tr>
              </thead>
              <tbody>
                {cmp.classes.map((c) => (
                  <tr key={c.id} className={`border-t border-stone-100 ${c.id === classId ? 'bg-board-soft/60' : ''}`}>
                    <td className="py-1.5 pr-3">
                      <button type="button" className="font-semibold underline-offset-2 hover:underline text-left" onClick={() => pick('class', c.id)}>
                        {c.name}
                      </button>
                      <span className="text-xs text-stone-500"> · {c.students} คน</span>
                    </td>
                    {[c.attendancePct, c.submitPct, c.examPct].map((v, i) => (
                      <td key={i} className="py-1.5 pr-3 min-w-32">
                        <span className="flex items-center gap-2">
                          <span className="h-2 flex-1 rounded-full overflow-hidden" style={{ background: TRACK }}>
                            <span className="block h-full rounded-full" style={{ width: `${v ?? 0}%`, background: GREEN }} />
                          </span>
                          <span className="tabular-nums w-12 text-right">{pctTxt(v)}</span>
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {schools && (
        <div className="flex flex-wrap gap-2">
          <select aria-label="ห้อง" className={sel} value={classId} onChange={(e) => pick('class', e.target.value)}>
            {schools.map((s) => (
              <optgroup key={s.schoolId} label={s.schoolName}>
                {s.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {terms.length > 1 && (
            <select aria-label="เทอม" className={sel} value={termId} onChange={(e) => pick('term', e.target.value)}>
              {terms.map((t, i) => (
                <option key={t.id} value={i === 0 ? '' : t.id}>
                  เทอม {t.name}
                  {i === 0 ? ' (ปัจจุบัน)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {!x && !error && <Loading />}
      {x && (
        <div className="grid gap-4 xl:grid-cols-2" data-testid="class-insights">
          <Card className="p-4">
            <BarChart
              title="มาเรียนรายสัปดาห์ (%)"
              series={[{ name: 'มาเรียน', color: GREEN }]}
              max={100}
              unit="%"
              emptyText="ยังไม่ได้เช็กชื่อในเทอมนี้"
              rows={x.attendanceWeeks.map((w) => {
                const all = w.present + w.late + w.sick + w.leave + w.absent
                const p = all ? Math.round(((w.present + w.late) / all) * 100) : 0
                return {
                  key: w.week,
                  label: shortDate(w.week),
                  segments: [p],
                  tip: (
                    <>
                      <b>สัปดาห์ {shortDate(w.week)}</b> · มาเรียน {p}%
                      <br />
                      มา {w.present} · สาย {w.late} · ป่วย {w.sick} · ลา {w.leave} · ขาด {w.absent}
                    </>
                  ),
                }
              })}
              table={{
                head: ['สัปดาห์', 'มา', 'สาย', 'ป่วย', 'ลา', 'ขาด'],
                body: x.attendanceWeeks.map((w) => [shortDate(w.week), w.present, w.late, w.sick, w.leave, w.absent]),
              }}
            />
          </Card>
          <Card className="p-4">
            <BarChart
              title={`การส่งงานแต่ละชิ้น (จาก ${x.students} คน)`}
              series={[
                { name: 'ตรงเวลา', color: GREEN },
                { name: 'ส่งช้า', color: AMBER },
                { name: 'ยังไม่ส่ง', color: TRACK },
              ]}
              max={Math.max(1, x.students)}
              emptyText="ยังไม่มีงานในเทอมนี้"
              rows={x.assignments.map((a, i) => ({
                key: a.id,
                label: `${i + 1}`,
                segments: [a.onTime, a.late, a.missing],
                tip: (
                  <>
                    <b>
                      {i + 1}. {a.title}
                    </b>
                    <br />
                    {formatDue(a.dueAt)}
                    <br />
                    ตรงเวลา {a.onTime} · ช้า {a.late} · ยังไม่ส่ง {a.missing}
                    {a.avgPct !== null && <> · เฉลี่ย {a.avgPct}%</>}
                  </>
                ),
              }))}
              table={{
                head: ['งาน', 'ตรงเวลา', 'ช้า', 'ยังไม่ส่ง', 'คะแนนเฉลี่ย'],
                body: x.assignments.map((a, i) => [`${i + 1}. ${a.title}`, a.onTime, a.late, a.missing, pctTxt(a.avgPct)]),
              }}
            />
          </Card>
          <Card className="p-4">
            <BarChart
              title="คะแนนสอบเฉลี่ยแต่ละครั้ง (%) · แตะแท่งเพื่อดูการกระจาย"
              series={[{ name: 'เฉลี่ย', color: GREEN }]}
              max={100}
              unit="%"
              emptyText="ยังไม่มีคะแนนสอบในเทอมนี้"
              selected={exam ?? undefined}
              onSelect={setExam}
              rows={x.exams.map((e, i) => ({
                key: e.id,
                label: `${i + 1}`,
                segments: [e.avgPct ?? 0],
                tip: (
                  <>
                    <b>
                      {i + 1}. {e.title}
                    </b>
                    <br />
                    เฉลี่ย {pctTxt(e.avgPct)} · ต่ำสุด {pctTxt(e.minPct)} · สูงสุด {pctTxt(e.maxPct)} · {e.n} คน
                  </>
                ),
              }))}
              table={{
                head: ['รายการ', 'คน', 'เฉลี่ย', 'ต่ำสุด', 'สูงสุด'],
                body: x.exams.map((e, i) => [`${i + 1}. ${e.title}`, e.n, pctTxt(e.avgPct), pctTxt(e.minPct), pctTxt(e.maxPct)]),
              }}
            />
          </Card>
          <Card className="p-4">
            {selExam ? (
              <BarChart
                title={`การกระจายคะแนน: ${selExam.title} (จำนวนคน)`}
                series={[{ name: 'จำนวนคน', color: GREEN }]}
                max={Math.max(4, ...selExam.buckets)}
                rows={selExam.buckets.map((n, i) => ({
                  key: String(i),
                  label: i === 9 ? '90+' : `${i * 10}`,
                  segments: [n],
                  tip: (
                    <>
                      ได้ {i * 10}–{i === 9 ? 100 : i * 10 + 9}% : <b>{n} คน</b>
                    </>
                  ),
                }))}
                table={{ head: ['ช่วงคะแนน', 'จำนวนคน'], body: selExam.buckets.map((n, i) => [`${i * 10}–${i === 9 ? 100 : i * 10 + 9}%`, n]) }}
              />
            ) : (
              <p className="text-sm text-stone-500 text-center py-10">ยังไม่มีคะแนนสอบให้ดูการกระจาย</p>
            )}
          </Card>
        </div>
      )}
    </TeacherLayout>
  )
}
