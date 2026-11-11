import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiClientError } from '../api'
import ReportSheet from '../components/ReportSheet'
import type { ReportCard } from '../../shared/report'
import { downloadA4Pdf } from '../lib/pdf'
import { Card, ErrorBox, Loading } from '../ui'

type Res = { available: false } | { available: true; card: ReportCard; releasedAt: number | null }

/** ใบสรุปผลปลายเทอมของนักเรียน (เมื่อครูเปิดให้พิมพ์) → ดาวน์โหลดเป็น PDF 1 หน้า A4 */
export default function StudentReport() {
  const navigate = useNavigate()
  const [res, setRes] = useState<Res | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sheet = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1)

  useEffect(() => {
    api<Res>('/api/student/report-card')
      .then(setRes)
      .catch((e) => (e instanceof ApiClientError && e.status === 401 ? navigate('/', { replace: true }) : setError(e.message)))
  }, [navigate])
  // ย่อตัวอย่างให้พอดีจอมือถือ (ไฟล์ PDF ยังเป็นขนาดจริง)
  useLayoutEffect(() => {
    const fit = () => box.current && setK(Math.min(1, box.current.clientWidth / 794))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [res])

  async function download() {
    if (!sheet.current || !res?.available) return
    setBusy(true)
    try {
      await downloadA4Pdf(sheet.current, `ใบสรุปผล-${res.card.term.replace('/', '-')}-${res.card.student.zipgradeId}.pdf`)
    } catch {
      setError('สร้างไฟล์ PDF ไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen max-w-3xl mx-auto pb-8">
      <header className="bg-board text-white px-5 pt-5 pb-6 rounded-b-3xl">
        <Link to="/me" className="text-sm opacity-85">
          ← งานของฉัน
        </Link>
        <h1 className="text-xl font-extrabold mt-2">📄 ใบสรุปผลการเรียน</h1>
      </header>
      <section className="p-4 flex flex-col gap-4">
        <ErrorBox message={error} />
        {!res && !error && <Loading />}
        {res && !res.available && <Card className="p-6 text-center text-sm text-stone-500">ครูยังไม่เปิดให้พิมพ์ใบสรุปผล (เปิดเมื่อปลายเทอม)</Card>}
        {res?.available && (
          <>
            <button type="button" onClick={() => void download()} disabled={busy} className="rounded-xl bg-board text-white px-4 py-3 font-bold disabled:opacity-60">
              {busy ? 'กำลังสร้างไฟล์…' : '⬇️ ดาวน์โหลด PDF (A4)'}
            </button>
            <div ref={box} className="w-full overflow-hidden" style={{ height: `${1123 * k}px` }}>
              <div style={{ transform: `scale(${k})`, transformOrigin: 'top left', width: 794 }}>
                <ReportSheet ref={sheet} card={res.card} />
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
