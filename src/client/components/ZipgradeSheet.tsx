import { EXAM_LETTERS } from '../../shared/makeupExam'

/**
 * กระดาษคำตอบแบบ ZipGrade ที่ฝนให้แล้วจากคำตอบที่นักเรียนเลือกออนไลน์ (A4 · พิมพ์เก็บ/แนบผลสอบ)
 * รหัสนักเรียนฝนในตาราง 0–9 · คำตอบเรียงตามข้อของชุดต้นฉบับ (ไม่ใช่ลำดับที่สลับให้นักเรียน)
 */
export default function ZipgradeSheet({ title, name, zipgradeId, answers, choiceCount, note }: { title: string; name: string; zipgradeId: string; answers: number[]; choiceCount: number; note?: string }) {
  const digits = zipgradeId.replace(/\D/g, '').padStart(Math.max(5, zipgradeId.length), ' ').slice(-10).split('')
  const cols = Math.max(1, Math.ceil(answers.length / 25))
  const bubble = (on: boolean, label: string) => (
    <span className={`inline-flex h-[15px] w-[15px] items-center justify-center rounded-full border text-[8px] ${on ? 'border-black bg-black text-black' : 'border-stone-500 text-stone-500'}`}>{on ? '' : label}</span>
  )
  return (
    <div data-testid="zipgrade-sheet" className="bg-white text-black mx-auto flex flex-col gap-3 p-[12mm]" style={{ width: '210mm', minHeight: '297mm' }}>
      <div className="flex items-start justify-between border-b-2 border-black pb-2">
        <div>
          <b className="text-xl">ZipGrade · กระดาษคำตอบ (ฝนจากการสอบออนไลน์)</b>
          <div className="text-sm">
            {title} · {name}
          </div>
          {note && <div className="text-xs text-stone-600">{note}</div>}
        </div>
        <div className="flex gap-0.5" aria-label={`รหัสนักเรียน ${zipgradeId}`}>
          {digits.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-[2px] border border-stone-400 px-[2px] py-[2px]">
              <b className="h-4 text-xs">{d.trim()}</b>
              {Array.from({ length: 10 }, (_, n) => (
                <span key={n}>{bubble(d === String(n), String(n))}</span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-x-6" style={{ gridTemplateColumns: `repeat(${Math.min(cols, 4)}, max-content)` }}>
        {Array.from({ length: cols }, (_, c) => (
          <div key={c} className="flex flex-col gap-[3px]">
            {answers.slice(c * 25, c * 25 + 25).map((a, j) => {
              const no = c * 25 + j + 1
              return (
                <div key={no} className="flex items-center gap-1 text-xs">
                  <b className="w-6 text-right tabular-nums">{no}</b>
                  {EXAM_LETTERS.slice(0, choiceCount).map((l, k) => (
                    <span key={l}>{bubble(a === k, l)}</span>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
