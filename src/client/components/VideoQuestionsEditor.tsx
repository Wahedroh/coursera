import { useId } from 'react'
import { MAX_VIDEO_QUESTIONS, type VideoQuestion } from '../../shared/videos'

const input = 'w-full border-2 border-line rounded-xl px-3 py-1.5 bg-white text-sm'
const LETTERS = ['ก', 'ข', 'ค', 'ง']

/** คำถามท้ายคลิป (ไม่บังคับ) — ติ๊กวงกลมหน้าตัวเลือกที่ถูก */
export default function VideoQuestionsEditor({ value, onChange }: { value: VideoQuestion[]; onChange: (v: VideoQuestion[]) => void }) {
  const uid = useId()
  const set = (i: number, q: Partial<VideoQuestion>) => onChange(value.map((x, j) => (j === i ? { ...x, ...q } : x)))
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold">คำถามท้ายคลิป (ไม่บังคับ · สูงสุด {MAX_VIDEO_QUESTIONS} ข้อ)</legend>
      <p className="text-xs text-stone-500">ถ้ามีคำถาม นักเรียนต้องดูถึง 70% และตอบถูกทุกข้อจึงได้ EXP (ตอบผิดลองใหม่ได้ ระบบไม่บอกว่าข้อไหนผิด)</p>
      {value.map((q, i) => (
        <div key={i} className="rounded-xl border border-line bg-stone-50 p-2 flex flex-col gap-1.5">
          <div className="flex gap-2 items-center">
            <b className="text-sm">{i + 1}.</b>
            <input aria-label={`คำถามข้อ ${i + 1}`} className={input} required maxLength={300} placeholder="คำถาม" value={q.q} onChange={(e) => set(i, { q: e.target.value })} />
            <button type="button" aria-label={`ลบคำถามข้อ ${i + 1}`} className="text-red-600 text-sm font-bold px-1" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
          {q.choices.map((c, k) => (
            <label key={k} className="flex gap-2 items-center pl-5">
              <input type="radio" name={`${uid}-answer-${i}`} checked={q.answer === k} onChange={() => set(i, { answer: k })} aria-label={`ข้อ ${i + 1} คำตอบที่ถูกคือ ${LETTERS[k]}`} />
              <span className="text-xs w-3">{LETTERS[k]}</span>
              <input
                aria-label={`ข้อ ${i + 1} ตัวเลือก ${LETTERS[k]}`}
                className={input}
                required
                maxLength={150}
                value={c}
                onChange={(e) => set(i, { choices: q.choices.map((x, m) => (m === k ? e.target.value : x)) })}
              />
              {q.choices.length > 2 && (
                <button
                  type="button"
                  aria-label={`ลบตัวเลือก ${LETTERS[k]} ข้อ ${i + 1}`}
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
      {value.length < MAX_VIDEO_QUESTIONS && (
        <button type="button" className="self-start rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold" onClick={() => onChange([...value, { q: '', choices: ['', ''], answer: 0 }])}>
          + เพิ่มคำถาม
        </button>
      )}
    </fieldset>
  )
}
