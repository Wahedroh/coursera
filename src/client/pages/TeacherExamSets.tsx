import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { EXAM_LETTERS, MAX_EXAM_QUESTIONS, type ExamQuestion, type ExamSet, type ExamSetSummary } from '../../shared/makeupExam'
import Icon from '../components/Icon'
import VideoQuestionsEditor from '../components/VideoQuestionsEditor'
import { resizeImage } from '../lib/image'
import { pdfToImages } from '../lib/pdfPages'
import { fileUrl, uploadImage } from '../lib/upload'
import { Button, Card, ErrorBox, Loading } from '../ui'
import TeacherLayout from './TeacherLayout'
import { useTeacherErrorHandler } from './useTeacherGuard'

type Draft = { id: string | null; kind: 'typed' | 'pages'; title: string; questions: ExamQuestion[]; pageKeys: string[]; answers: number[]; choiceCount: number }
const blank = (kind: Draft['kind']): Draft => ({ id: null, kind, title: '', questions: [{ q: '', choices: ['', '', '', ''], answer: 0 }], pageKeys: [], answers: Array.from({ length: 10 }, () => -1), choiceCount: 4 })
const input = 'w-full border-2 border-line rounded-xl px-3 py-1.5 bg-white'

/** ชุดข้อสอบปรนัยสำหรับสอบย้อนหลังออนไลน์ */
export default function TeacherExamSets() {
  const handle = useTeacherErrorHandler()
  const [list, setList] = useState<ExamSetSummary[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(() => {
    api<ExamSetSummary[]>('/api/teacher/exam-sets')
      .then(setList)
      .catch((e) => setError(handle(e)))
  }, [handle])
  useEffect(load, [load])

  async function edit(id: string) {
    try {
      const s = await api<ExamSet>(`/api/teacher/exam-sets/${id}`)
      setDraft({ id: s.id, kind: s.kind, title: s.title, questions: s.questions, pageKeys: s.pageKeys, answers: s.answers, choiceCount: s.choiceCount })
    } catch (e) {
      setError(handle(e))
    }
  }
  async function save() {
    if (!draft) return
    setError(null)
    const body =
      draft.kind === 'typed'
        ? { kind: 'typed', title: draft.title, questions: draft.questions }
        : { kind: 'pages', title: draft.title, pageKeys: draft.pageKeys, choiceCount: draft.choiceCount, answers: draft.answers }
    if (draft.kind === 'pages' && draft.answers.some((a) => a < 0)) return setError('ใส่เฉลยให้ครบทุกข้อ')
    setBusy('กำลังบันทึก…')
    try {
      if (draft.id) await api(`/api/teacher/exam-sets/${draft.id}`, { method: 'PUT', body })
      else await api('/api/teacher/exam-sets', { body })
      setDraft(null)
      load()
    } catch (e) {
      setError(handle(e))
    } finally {
      setBusy(null)
    }
  }
  async function remove(s: ExamSetSummary) {
    if (!window.confirm(`ลบชุดข้อสอบ “${s.title}”?`)) return
    try {
      await api(`/api/teacher/exam-sets/${s.id}`, { method: 'DELETE' })
      load()
    } catch (e) {
      setError(handle(e))
    }
  }
  async function addPages(files: FileList | null) {
    if (!files?.length || !draft) return
    setError(null)
    try {
      const keys: string[] = []
      for (const f of Array.from(files)) {
        const blobs = f.type === 'application/pdf' ? (setBusy('กำลังแปลง PDF เป็นรูป…'), await pdfToImages(f)) : [await resizeImage(f, 1600, 0.85)]
        for (const [i, b] of blobs.entries()) {
          setBusy(`กำลังอัปโหลดหน้า ${keys.length + 1}${blobs.length > 1 ? `/${blobs.length}` : ''}…`)
          keys.push(await uploadImage(b, 'exam'))
          void i
        }
      }
      setDraft((d) => (d ? { ...d, pageKeys: [...d.pageKeys, ...keys] } : d))
    } catch (e) {
      setError(handle(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <TeacherLayout>
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <Link to="/teacher/makeup-exams" className="text-sm text-stone-500">
            ← สอบย้อนหลัง
          </Link>
          <h1 className="text-2xl font-extrabold">
            <Icon n="exam" /> ชุดข้อสอบ (ปรนัย)
          </h1>
        </div>
        {!draft && (
          <>
            <Button onClick={() => setDraft(blank('typed'))}>+ พิมพ์ข้อสอบในระบบ</Button>
            <Button variant="ghost" onClick={() => setDraft(blank('pages'))}>
              + จาก PDF/รูปข้อสอบ
            </Button>
          </>
        )}
      </div>
      <p className="text-xs text-stone-500">พิมพ์ในระบบ = สลับข้อ/ตัวเลือกให้แต่ละคนได้ · จาก PDF = ใช้ข้อสอบกระดาษเดิม + ใส่เฉลย (ไม่สลับ) · ชุดที่มีคนสอบแล้วแก้ไม่ได้</p>
      <ErrorBox message={error} />
      {draft ? (
        <Card className="p-4 flex flex-col gap-3">
          <label className="text-sm font-semibold">
            ชื่อชุดข้อสอบ
            <input aria-label="ชื่อชุดข้อสอบ" className={input} value={draft.title} maxLength={120} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="เช่น สอบย่อยบทที่ 3 ชุด B" />
          </label>
          {draft.kind === 'typed' ? (
            <VideoQuestionsEditor
              value={draft.questions}
              onChange={(questions) => setDraft({ ...draft, questions })}
              max={MAX_EXAM_QUESTIONS}
              letters={EXAM_LETTERS}
              allowImage
              legend={`ข้อสอบ (สูงสุด ${MAX_EXAM_QUESTIONS} ข้อ · ตัวเลือก 2–4)`}
              hint="ติ๊กวงกลมหน้าตัวเลือกที่ถูก · นักเรียนแต่ละคนเห็นลำดับข้อ/ตัวเลือกต่างกัน (ถ้าครูเลือกสลับตอนอนุมัติ)"
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <label className="rounded-xl border-2 border-line bg-white px-3 py-1.5 text-sm font-semibold cursor-pointer">
                  <Icon n="import" /> เพิ่มหน้าข้อสอบ (PDF หรือรูป)
                  <input type="file" accept="application/pdf,image/*" multiple className="sr-only" aria-label="ไฟล์ข้อสอบ" onChange={(e) => void addPages(e.target.files)} />
                </label>
                <span className="text-xs text-stone-500">{draft.pageKeys.length} หน้า · PDF แปลงเป็นรูปในเครื่องนี้ (นักเรียนเห็นพร้อมลายน้ำชื่อ)</span>
              </div>
              <div className="flex gap-2 overflow-x-auto">
                {draft.pageKeys.map((k, i) => (
                  <div key={k} className="relative shrink-0">
                    <img src={fileUrl(k)} alt={`หน้า ${i + 1}`} className="h-32 rounded border border-line" />
                    <button type="button" aria-label={`ลบหน้า ${i + 1}`} className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-600 text-xs text-white" onClick={() => setDraft({ ...draft, pageKeys: draft.pageKeys.filter((x) => x !== k) })}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label>
                  จำนวนข้อ{' '}
                  <input
                    type="number"
                    aria-label="จำนวนข้อ"
                    min={1}
                    max={MAX_EXAM_QUESTIONS}
                    className="w-20 rounded-lg border-2 border-line px-2 py-1"
                    value={draft.answers.length}
                    onChange={(e) => {
                      const n = Math.max(1, Math.min(MAX_EXAM_QUESTIONS, Number(e.target.value) || 1))
                      setDraft({ ...draft, answers: Array.from({ length: n }, (_, i) => draft.answers[i] ?? -1) })
                    }}
                  />
                </label>
                <label>
                  ตัวเลือกต่อข้อ{' '}
                  <select aria-label="ตัวเลือกต่อข้อ" className="rounded-lg border-2 border-line px-2 py-1" value={draft.choiceCount} onChange={(e) => setDraft({ ...draft, choiceCount: Number(e.target.value), answers: draft.answers.map((a) => (a >= Number(e.target.value) ? -1 : a)) })}>
                    {[2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} ({EXAM_LETTERS.slice(0, n).join('')})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <fieldset className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4" aria-label="เฉลย">
                {draft.answers.map((a, i) => (
                  <div key={i} className="flex items-center gap-1 text-sm">
                    <b className="w-7 text-right">{i + 1}</b>
                    {EXAM_LETTERS.slice(0, draft.choiceCount).map((l, k) => (
                      <button key={l} type="button" aria-label={`เฉลยข้อ ${i + 1} ${l}`} aria-pressed={a === k} onClick={() => setDraft({ ...draft, answers: draft.answers.map((x, j) => (j === i ? k : x)) })} className={`h-7 w-7 rounded-full border-2 text-xs font-bold ${a === k ? 'border-board bg-board text-white' : 'border-line bg-white'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                ))}
              </fieldset>
            </>
          )}
          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={!!busy || !draft.title.trim() || (draft.kind === 'pages' && !draft.pageKeys.length)}>
              {busy ?? 'บันทึกชุดข้อสอบ'}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={!!busy}>
              ยกเลิก
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {!list && !error && <Loading />}
          {list?.length === 0 && <Card className="p-6 text-center text-stone-500">ยังไม่มีชุดข้อสอบ</Card>}
          {list?.map((s) => (
            <Card key={s.id} className="p-3 flex items-center gap-3">
              <Icon n={s.kind === 'typed' ? 'task' : 'doc'} className="text-xl" />
              <div className="flex-1">
                <b>{s.title}</b>
                <div className="text-xs text-stone-500">
                  {s.count} ข้อ · {s.kind === 'typed' ? 'พิมพ์ในระบบ (สลับข้อได้)' : 'จาก PDF/รูป'}
                </div>
              </div>
              <Button variant="ghost" onClick={() => void edit(s.id)}>
                แก้
              </Button>
              <button type="button" className="text-sm text-stone-500 underline" onClick={() => void remove(s)}>
                ลบ
              </button>
            </Card>
          ))}
        </>
      )}
    </TeacherLayout>
  )
}
