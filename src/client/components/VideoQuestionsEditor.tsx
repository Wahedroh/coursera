import { useId, useState } from 'react'
import { fileUrl, uploadImage } from '../lib/upload'
import { resizeImage } from '../lib/image'
import { MAX_VIDEO_QUESTIONS, type VideoQuestion } from '../../shared/videos'

const input = 'w-full border-2 border-line rounded-xl px-3 py-1.5 bg-white text-sm'
const LETTERS_TH = ['ก', 'ข', 'ค', 'ง']
type Q = VideoQuestion & { image?: string; seconds?: number }
const TIMES = [0, 10, 20, 30, 45, 60, 90, 120]

/** คำถามท้ายคลิป (ไม่บังคับ) — ติ๊กวงกลมหน้าตัวเลือกที่ถูก */
export default function VideoQuestionsEditor({
  value,
  onChange,
  max = MAX_VIDEO_QUESTIONS,
  legend = `คำถามท้ายคลิป (ไม่บังคับ · สูงสุด ${MAX_VIDEO_QUESTIONS} ข้อ)`,
  letters,
  allowImage = false,
  allowTimer = false,
  hint = 'ถ้ามีคำถาม นักเรียนต้องดูถึง 70% และตอบถูกทุกข้อจึงได้ EXP (ตอบผิดลองใหม่ได้ ระบบไม่บอกว่าข้อไหนผิด)',
}: {
  value: Q[]
  onChange: (v: Q[]) => void
  /** ครูแนบรูปโจทย์ได้ (เกมการ์ด) */
  allowImage?: boolean
  /** ตั้งเวลาตอบรายข้อ (เกมการ์ด) */
  allowTimer?: boolean
  max?: number
  legend?: string
  hint?: string
  letters?: readonly string[]
}) {
  const uid = useId()
  const [uploading, setUploading] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  async function pickImage(i: number, file: File | undefined) {
    if (!file) return
    setUploading(i)
    setErr(null)
    try {
      set(i, { image: await uploadImage(await resizeImage(file, 1600, 0.85), 'quiz') })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'อัปโหลดรูปไม่สำเร็จ')
    } finally {
      setUploading(null)
    }
  }
  const set = (i: number, q: Partial<Q>) => onChange(value.map((x, j) => (j === i ? { ...x, ...q } : x)))
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold">{legend}</legend>
      <p className="text-xs text-stone-500">{hint}</p>
      {value.map((q, i) => (
        <div key={i} className="rounded-xl border border-line bg-stone-50 p-2 flex flex-col gap-1.5">
          <div className="flex gap-2 items-center">
            <b className="text-sm">{i + 1}.</b>
            <input aria-label={`คำถามข้อ ${i + 1}`} className={input} required={!q.image} maxLength={300} placeholder={q.image ? 'ข้อความประกอบ (ไม่บังคับ)' : 'คำถาม'} value={q.q} onChange={(e) => set(i, { q: e.target.value })} />
            <button type="button" aria-label={`ลบคำถามข้อ ${i + 1}`} className="text-red-600 text-sm font-bold px-1" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
          {allowTimer && (
            <label className="pl-5 flex items-center gap-2 text-xs font-semibold">
              ⏱️ เวลาตอบ
              <select aria-label={`เวลาตอบข้อ ${i + 1}`} className="border border-line rounded-lg px-2 py-1 bg-white" value={q.seconds ?? 0} onChange={(e) => set(i, { seconds: Number(e.target.value) || undefined })}>
                {TIMES.map((t) => (
                  <option key={t} value={t}>
                    {t ? `${t} วินาที` : 'ไม่จำกัด'}
                  </option>
                ))}
              </select>
            </label>
          )}
          {allowImage && (
            <div className="pl-5 flex flex-wrap items-center gap-2">
              {q.image && <img src={fileUrl(q.image)} alt={`รูปโจทย์ข้อ ${i + 1}`} className="max-h-32 rounded-lg border border-line bg-white" />}
              <label className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold cursor-pointer">
                {uploading === i ? 'กำลังอัปโหลด…' : q.image ? '🖼️ เปลี่ยนรูป' : '🖼️ ใส่รูปโจทย์'}
                <input type="file" accept="image/*" className="sr-only" aria-label={`รูปโจทย์ข้อ ${i + 1}`} disabled={uploading !== null} onChange={(e) => void pickImage(i, e.target.files?.[0])} />
              </label>
              {q.image && (
                <button type="button" className="text-xs text-red-700 underline" onClick={() => set(i, { image: undefined })}>
                  เอารูปออก
                </button>
              )}
              {q.image && <span className="text-xs text-stone-500">ตัวเลือกอยู่ในรูปแล้ว เว้นช่องตัวเลือกว่างได้</span>}
            </div>
          )}
          {q.choices.map((c, k) => (
            <label key={k} className="flex gap-2 items-center pl-5">
              <input type="radio" name={`${uid}-answer-${i}`} checked={q.answer === k} onChange={() => set(i, { answer: k })} aria-label={`ข้อ ${i + 1} คำตอบที่ถูกคือ ${(letters ?? LETTERS_TH)[k]}`} />
              <span className="text-xs w-3">{(letters ?? LETTERS_TH)[k]}</span>
              <input
                aria-label={`ข้อ ${i + 1} ตัวเลือก ${(letters ?? LETTERS_TH)[k]}`}
                className={input}
                required={!q.image}
                maxLength={150}
                value={c}
                onChange={(e) => set(i, { choices: q.choices.map((x, m) => (m === k ? e.target.value : x)) })}
              />
              {q.choices.length > 2 && (
                <button
                  type="button"
                  aria-label={`ลบตัวเลือก ${(letters ?? LETTERS_TH)[k]} ข้อ ${i + 1}`}
                  className="text-stone-400 text-xs px-1"
                  onClick={() => set(i, { choices: q.choices.filter((_, m) => m !== k), answer: q.answer === k ? 0 : q.answer > k ? q.answer - 1 : q.answer })}
                >
                  ✕
                </button>
              )}
            </label>
          ))}
          {q.choices.length < 4 && (
            <button type="button" className="self-start pl-5 text-xs underline" onClick={() => set(i, { choices: [...q.choices, ''] })}>
              + เพิ่มตัวเลือก
            </button>
          )}
        </div>
      ))}
      {value.length < max && (
        <button type="button" className="self-start rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold" onClick={() => onChange([...value, { q: '', choices: ['', ''], answer: 0 }])}>
          + เพิ่มคำถาม
        </button>
      )}
    </fieldset>
  )
}
