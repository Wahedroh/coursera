import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api'
import { ATTENDANCE_STATUSES, STATUS_LABEL } from '../../shared/attendance'
import { baht } from '../../shared/fees'
import type { ClassReport, ReportStudent } from '../../shared/report'
import { formatDate } from '../lib/format'
import { downloadPagesPdf, externalBrowserUrl, inAppBrowser } from '../lib/pdf'
import { Button, Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

const dateTh = (t: number) =>
  new Date(t).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  })

function assignmentCell(a: ReportStudent['assignments'][number], now: number): { text: string; tone: string } {
  if (a.status === 'graded')
    return {
      text: a.score === null ? 'ตรวจแล้ว' : `${a.score}/${a.maxScore}`,
      tone: '',
    }
  if (a.status === 'submitted') return { text: 'ส่งแล้ว รอตรวจ', tone: 'text-stone-500' }
  if (a.status === 'late') return { text: 'ส่งช้า รอตรวจ', tone: 'text-stone-500' }
  if (a.status === 'returned') return { text: 'ส่งกลับให้แก้', tone: 'text-amber-700 font-semibold' }
  return a.dueAt !== null && a.dueAt < now ? { text: 'ไม่ส่ง', tone: 'text-red-700 font-semibold' } : { text: 'ยังไม่ถึงกำหนด', tone: 'text-stone-400' }
}

/** รายงานรายบุคคล 1 หน้า A4 ต่อคน — พิมพ์ทั้งห้องหรือทีละคน / บันทึกเป็น PDF จากหน้าต่างพิมพ์ของเบราว์เซอร์ */
export default function TeacherReport() {
  const { id = '' } = useParams()
  const handle = useTeacherErrorHandler()
  const [data, setData] = useState<ClassReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [who, setWho] = useState<string>('all')
  const [showGrade, setShowGrade] = useState(true)
  const [note, setNote] = useState('')
  const [pdfState, setPdfState] = useState<string | null>(null)
  const pagesRef = useRef<HTMLDivElement>(null)

  async function savePdf() {
    if (!data || !pagesRef.current) return
    const pages = [...pagesRef.current.querySelectorAll<HTMLElement>('.report-page')]
    const one = who === 'all' ? null : data.students.find((s) => s.id === who)
    const fileName = one ? `รายงาน-${one.name}-${data.class.name}.pdf` : `รายงานรายบุคคล-${data.class.name}.pdf`
    setError(null)
    try {
      setPdfState(`กำลังสร้าง PDF 0/${pages.length}`)
      await downloadPagesPdf(pages, fileName, (d, n) => setPdfState(`กำลังสร้าง PDF ${d}/${n}`))
      setPdfState(null)
    } catch (e) {
      setPdfState(null)
      setError(`สร้าง PDF ไม่สำเร็จ (${e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ'}) — ลองกด "พิมพ์" แล้วเลือกบันทึกเป็น PDF แทน`)
    }
  }

  useEffect(() => {
    api<ClassReport>(`/api/teacher/classes/${id}/report`)
      .then(setData)
      .catch((e) => setError(handle(e)))
  }, [id, handle])

  const list = data?.students.filter((s) => who === 'all' || s.id === who) ?? []

  return (
    <TeacherLayout>
      <div className="print:hidden flex flex-col gap-3">
        <Link to={`/teacher/classes/${id}`} className="text-sm text-stone-500">
          ← {data?.class.name ?? 'หน้าห้อง'}
        </Link>
        <h1 className="text-2xl font-extrabold">รายงานรายบุคคล</h1>
        <ErrorBox message={error} />
        {!data && !error && <Loading />}
        {data && (
          <Card className="p-4 flex flex-wrap gap-4 items-end">
            <label className="text-sm font-semibold">
              นักเรียน
              <select className="block border-2 border-line rounded-xl px-3 py-2 bg-white" value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="all">ทั้งห้อง ({data.students.length} คน)</option>
                {data.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.zipgradeId})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold flex-1 min-w-56">
              ข้อความถึงผู้ปกครอง (ไม่บังคับ · ใส่ทุกใบ)
              <input
                className="block w-full border-2 border-line rounded-xl px-3 py-2 bg-white"
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น กรุณาติดตามการส่งงานของนักเรียน"
              />
            </label>
            <label className="flex items-center gap-2 text-sm pb-2">
              <input type="checkbox" checked={showGrade} onChange={(e) => setShowGrade(e.target.checked)} /> แสดงเกรดคาดการณ์
            </label>
            <Button type="button" onClick={() => void savePdf()} disabled={pdfState !== null}>
              {pdfState ?? '⬇ ดาวน์โหลด PDF'}
            </Button>
            <button type="button" onClick={() => window.print()} className="rounded-2xl border-2 border-line bg-white px-4 py-2 font-bold">
              🖨 พิมพ์
            </button>
          </Card>
        )}
        {inAppBrowser() && (
          <Card className="p-3 bg-amber-50 border-amber-200 text-sm">
            ⚠️ กำลังเปิดในแอป (เช่น LINE) ซึ่งมักดาวน์โหลดไฟล์และพิมพ์ไม่ได้ —{' '}
            <a className="font-bold underline" href={externalBrowserUrl()}>
              เปิดใน Chrome / Safari
            </a>
          </Card>
        )}
        <p className="text-xs text-stone-500">1 คน = 1 หน้า A4 · "ดาวน์โหลด PDF" ได้ไฟล์ทันที (ทั้งห้องอาจใช้เวลาสักครู่) · ตัวอย่างด้านล่างคือหน้าที่จะได้</p>
      </div>
      <div ref={pagesRef} className="flex flex-col gap-4 print:block">
        {data &&
          list.map((s) => (
            <article key={s.id} className="report-page bg-white border border-line rounded-2xl p-6 print:border-0 print:rounded-none print:p-0 text-[13px] leading-relaxed" data-testid="report-page">
              <header className="flex items-center gap-3 border-b-2 border-board pb-2">
                <img src="/logo.png" alt="" className="w-12 h-12" />
                <div className="flex-1">
                  <h2 className="text-lg font-extrabold">รายงานผลการเรียนรายบุคคล</h2>
                  <p className="text-stone-600">
                    {data.class.name} · ข้อมูล ณ {dateTh(data.generatedAt)}
                  </p>
                </div>
              </header>
              <div className="flex flex-wrap justify-between gap-2 mt-3">
                <p className="text-base">
                  <b>{s.name}</b> · ZipGrade ID {s.zipgradeId}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="rounded-xl bg-stone-50 p-2">
                  <div className="text-xs text-stone-500">การมาเรียน</div>
                  <div>{ATTENDANCE_STATUSES.map((st) => `${STATUS_LABEL[st]} ${s.attendance[st]}`).join(' · ')}</div>
                </div>
                <div className="rounded-xl bg-stone-50 p-2">
                  <div className="text-xs text-stone-500">คะแนนสะสม{showGrade && ' · เกรดคาดการณ์'}</div>
                  <div>
                    <b>
                      {s.total}/{data.maxTotal}
                    </b>
                    {showGrade && (
                      <>
                        {' '}
                        · เกรด <b>{s.grade ?? '–'}</b>
                      </>
                    )}
                    {showGrade && s.rank !== null && (
                      <span className="text-stone-500">
                        {' '}
                        (อันดับ {s.rank}/{data.classSize})
                      </span>
                    )}
                  </div>
                </div>
                <div className="rounded-xl bg-stone-50 p-2">
                  <div className="text-xs text-stone-500">ค่าเอกสารค้างชำระ</div>
                  <div className={s.feeOutstanding > 0 ? 'text-red-700 font-semibold' : ''}>{s.feeOutstanding > 0 ? baht(s.feeOutstanding) : 'ไม่มี'}</div>
                </div>
              </div>
              <h3 className="font-bold mt-3">
                งานที่มอบหมาย ({s.assignments.filter((a) => a.status !== 'missing' && a.status !== 'returned').length}/{s.assignments.length} ส่งแล้ว)
              </h3>
              {s.assignments.length === 0 ? (
                <p className="text-stone-500">ยังไม่มีงาน</p>
              ) : (
                <table className="w-full border-collapse">
                  <tbody>
                    {s.assignments.map((a, i) => {
                      const c = assignmentCell(a, data.generatedAt)
                      return (
                        <tr key={i} className="border-b border-stone-200">
                          <td className="py-0.5 pr-2">{a.title}</td>
                          <td className="py-0.5 pr-2 text-stone-500 whitespace-nowrap">{a.dueAt ? `กำหนด ${dateTh(a.dueAt)}` : ''}</td>
                          <td className={`py-0.5 text-right whitespace-nowrap ${c.tone}`}>{c.text}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              <h3 className="font-bold mt-3">คะแนนสอบ</h3>
              {s.exams.length === 0 ? (
                <p className="text-stone-500">ยังไม่มีรายการสอบ</p>
              ) : (
                <table className="w-full border-collapse">
                  <tbody>
                    {s.exams.map((x, i) => (
                      <tr key={i} className="border-b border-stone-200">
                        <td className="py-0.5 pr-2">{x.title}</td>
                        <td className="py-0.5 pr-2 text-stone-500 whitespace-nowrap">{formatDate(x.takenOn)}</td>
                        <td className={`py-0.5 text-right whitespace-nowrap ${x.absent ? 'text-red-700 font-semibold' : ''}`}>
                          {x.absent ? 'ขาดสอบ' : x.score === null ? '–' : `${x.score}/${x.maxScore}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {note && <p className="mt-3 rounded-xl border border-line p-2">หมายเหตุจากครู: {note}</p>}
              {showGrade && <p className="mt-2 text-xs text-stone-500">เกรดคาดการณ์คิดแบบอิงกลุ่มจากคะแนนสะสม ณ วันที่ออกรายงาน อาจเปลี่ยนเมื่อมีคะแนนเพิ่ม</p>}
              <div className="grid grid-cols-2 gap-8 mt-8 text-center text-stone-600">
                <div>
                  ลงชื่อ ......................................................
                  <br />
                  ครูผู้สอน
                </div>
                <div>
                  ลงชื่อ ......................................................
                  <br />
                  ผู้ปกครอง
                </div>
              </div>
            </article>
          ))}
      </div>
    </TeacherLayout>
  )
}
