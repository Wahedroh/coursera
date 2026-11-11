import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api'
import ReportSheet from '../components/ReportSheet'
import type { ReportCard, ReportRelease } from '../../shared/report'
import type { Term } from '../../shared/terms'
import { Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type Data = { release: ReportRelease; term: { id: string; name: string }; cards: ReportCard[] }

/** ใบสรุปผลปลายเทอม: ครูเปิดให้นักเรียนพิมพ์ · ตั้งค่าที่แสดง · ดูตัวอย่าง · พิมพ์ทั้งห้อง (1 คน/หน้า) */
export default function TeacherReportCards() {
  const { id = '' } = useParams()
  const handle = useTeacherErrorHandler()
  const [terms, setTerms] = useState<Term[]>([])
  const [termId, setTermId] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [only, setOnly] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setData(null)
    api<Data>(`/api/teacher/classes/${id}/report-cards${termId ? `?term=${termId}` : ''}`)
      .then(setData)
      .catch((e) => setError(handle(e)))
  }, [id, termId, handle])
  useEffect(load, [load])
  useEffect(() => {
    api<Term[]>('/api/teacher/terms').then(setTerms).catch(() => {})
  }, [])

  async function save(r: Partial<ReportRelease>) {
    if (!data) return
    const next = { ...data.release, ...r }
    if (r.released && !window.confirm(`เปิดให้นักเรียนห้องนี้ดาวน์โหลดใบสรุปผลเทอม ${data.term.name}?\n\nตรวจคะแนนให้ครบก่อน · ปิดได้ทุกเมื่อ`)) return
    setBusy(true)
    try {
      const rel = await api<ReportRelease>(`/api/teacher/classes/${id}/report-release`, {
        method: 'PUT',
        body: { released: next.released, showGrade: next.showGrade, showRank: next.showRank, showComment: next.showComment, termId: data.term.id },
      })
      setData({ ...data, release: rel })
      load()
    } catch (e) {
      setError(handle(e))
    } finally {
      setBusy(false)
    }
  }

  const shown = data?.cards.filter((c) => !only || c.student.id === only) ?? []
  return (
    <TeacherLayout>
      <div className="no-print flex flex-col gap-3">
        <Link to={`/teacher/classes/${id}`} className="text-sm text-stone-500">
          ← หน้าห้อง
        </Link>
        <h1 className="text-2xl font-extrabold">📄 ใบสรุปผลปลายเทอม</h1>
        <ErrorBox message={error} />
        {!data && !error && <Loading />}
        {data && (
          <Card className="p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {terms.length > 1 && (
                <select aria-label="เทอม" className="border-2 border-line rounded-xl px-3 py-1.5 bg-white font-semibold" value={termId} onChange={(e) => setTermId(e.target.value)}>
                  {terms.map((t, i) => (
                    <option key={t.id} value={i === 0 ? '' : t.id}>
                      เทอม {t.name}
                    </option>
                  ))}
                </select>
              )}
              <label className="flex items-center gap-2 font-bold">
                <input type="checkbox" className="w-5 h-5" checked={data.release.released} disabled={busy} onChange={(e) => void save({ released: e.target.checked })} aria-label="เปิดให้นักเรียนดาวน์โหลด" />
                {data.release.released ? <span className="text-board">เปิดให้นักเรียนดาวน์โหลดแล้ว</span> : <span>ยังไม่เปิดให้นักเรียน</span>}
              </label>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              {(
                [
                  ['showGrade', 'แสดงเกรด'],
                  ['showRank', 'แสดงอันดับในห้อง'],
                  ['showComment', 'แสดงความเห็นครู (โน้ตในหน้าวิเคราะห์รายคน)'],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={data.release[k]} disabled={busy} onChange={(e) => void save({ [k]: e.target.checked })} />
                  {l}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <select aria-label="ดูของใคร" className="border-2 border-line rounded-xl px-3 py-1.5 bg-white" value={only} onChange={(e) => setOnly(e.target.value)}>
                <option value="">ทั้งห้อง ({data.cards.length} คน)</option>
                {data.cards.map((c) => (
                  <option key={c.student.id} value={c.student.id}>
                    {c.student.name} ({c.student.zipgradeId})
                  </option>
                ))}
              </select>
              <button type="button" className="rounded-xl bg-board text-white px-4 py-2 font-bold" onClick={() => window.print()}>
                🖨️ พิมพ์ {only ? '1 คน' : 'ทั้งห้อง'} (1 คน/หน้า)
              </button>
              <Link to={`/teacher/classes/${id}/analysis`} className="text-sm underline">
                ✏️ เขียนความเห็นครูรายคน
              </Link>
            </div>
            <p className="text-xs text-stone-500">คะแนนสอบที่ยังไม่เผยแพร่จะไม่แสดง · แก้คะแนนหลังเปิดแล้ว ใบสรุปผลอัปเดตตาม · นักเรียนดาวน์โหลดเป็น PDF จากหน้า "คะแนนสอบ"</p>
          </Card>
        )}
      </div>
      <div className="flex flex-col gap-6 items-center overflow-x-auto print:block">
        {shown.map((c) => (
          <ReportSheet key={c.student.id} card={c} />
        ))}
      </div>
    </TeacherLayout>
  )
}
