import { EXAM_LETTERS } from '../../shared/makeupExam'

/**
 * กระดาษคำตอบ ZipGrade ที่ฝนให้แล้วจากคำตอบที่นักเรียนเลือกออนไลน์ (A4)
 * ≤ 40 ข้อ: วาดตามแบบฟอร์มจริง "40-ABCDE (9467)" ของ ZipGrade (ตำแหน่งจุดอ้างอิง/แถบรหัส/วงกลมตรงกับต้นฉบับ) — พิมพ์ 100% แล้วสแกนด้วยแอป ZipGrade ได้
 * > 40 ข้อ: แบบทั่วไป (พิมพ์เก็บเป็นหลักฐาน สแกนไม่ได้)
 * คำตอบเรียงตามข้อของชุดต้นฉบับ (ไม่ใช่ลำดับที่สลับให้นักเรียน)
 */
export default function ZipgradeSheet(p: { title: string; name: string; className?: string; zipgradeId: string; answers: number[]; choiceCount: number; note?: string }) {
  return p.answers.length <= FORM40.max && p.choiceCount <= 5 ? <Form40 {...p} /> : <GenericSheet {...p} />
}

// ---------- แบบฟอร์ม ZipGrade 40 ข้อ (พิกัดวัดจากต้นฉบับ หน่วย px · 1 มม. ≈ 6.04 px) ----------
export const FORM40 = {
  max: 40,
  idDigits: 5,
  /** หน้า A4 ในพิกัดต้นฉบับ */
  page: { x: 8, y: 0, w: 1268, h: 1793 },
  r: 17,
  /** จุดอ้างอิงมุม (สี่เหลี่ยมดำ 33 px) */
  corners: [
    [167, 244],
    [1084, 244],
    [167, 878],
    [1084, 878],
    [167, 1511],
    [1084, 1511],
  ],
  /** จุดกลาง 24×22 */
  mids: [
    [630, 432],
    [630, 954],
    [630, 1523],
  ],
  /** แถบรหัสแบบฟอร์มด้านซ้าย [y, สูง] (x 167 กว้าง 33) */
  bars: [
    [1036, 8],
    [1056, 8],
    [1076, 8],
    [1096, 21],
    [1129, 21],
    [1162, 8],
    [1182, 20],
    [1214, 21],
    [1247, 21],
    [1293, 8],
    [1313, 8],
    [1333, 8],
    [1366, 20],
  ],
  /** x ของตัวเลือก A–E ในแต่ละคอลัมน์ */
  cols: [
    [306, 350, 393, 436, 480],
    [574, 618, 661.5, 704, 748],
    [843, 886, 930, 972, 1016],
  ],
  upper: [494, 552, 610, 668, 726, 784, 841, 898],
  lower: [1016.5, 1074, 1132, 1190, 1248, 1306, 1364, 1421, 1478],
  idX: [852, 894, 938, 981, 1024],
  idY: [1016.5, 1068, 1120, 1172, 1224, 1276, 1328, 1380, 1432, 1484],
} as const

/** ข้อที่ n (1–40) อยู่ที่คอลัมน์ไหน แถว y เท่าไร */
export function form40Slot(n: number): { col: number; y: number } {
  if (n <= 8) return { col: 0, y: FORM40.upper[n - 1] }
  if (n <= 17) return { col: 0, y: FORM40.lower[n - 9] }
  if (n <= 25) return { col: 1, y: FORM40.upper[n - 18] }
  if (n <= 34) return { col: 1, y: FORM40.lower[n - 26] }
  return { col: 2, y: FORM40.upper[n - 35] }
}

const GRAY = '#9a9a9a'
function Form40({ title, name, className, zipgradeId, answers, note }: { title: string; name: string; className?: string; zipgradeId: string; answers: number[]; note?: string }) {
  const F = FORM40
  const id = zipgradeId.replace(/\D/g, '')
  const idFits = id.length > 0 && id.length <= F.idDigits
  const bubble = (key: string, x: number, y: number, label: string, on: boolean) =>
    on ? (
      <circle key={key} cx={x} cy={y} r={F.r} fill="#000" />
    ) : (
      <g key={key}>
        <circle cx={x} cy={y} r={F.r} fill="none" stroke={GRAY} strokeWidth={1.6} />
        <text x={x} y={y + 6} fontSize={17} textAnchor="middle" fill={GRAY}>
          {label}
        </text>
      </g>
    )
  return (
    <div data-testid="zipgrade-sheet" className="bg-white text-black mx-auto" style={{ width: '210mm', height: '297mm' }}>
      <svg viewBox={`${F.page.x} ${F.page.y} ${F.page.w} ${F.page.h}`} width="100%" height="100%" fontFamily="Lato, 'Noto Sans Thai', Sarabun, sans-serif" role="img" aria-label={`กระดาษคำตอบ ZipGrade ${name} รหัส ${zipgradeId}`}>
        <rect x={F.page.x} y={F.page.y} width={F.page.w} height={F.page.h} fill="#fff" />
        {F.corners.map(([x, y]) => (
          <rect key={`c${x}-${y}`} x={x} y={y} width={33} height={33} fill="#000" />
        ))}
        {F.mids.map(([x, y]) => (
          <rect key={`m${y}`} x={x} y={y} width={24} height={22} fill="#000" />
        ))}
        {F.bars.map(([y, h]) => (
          <rect key={`b${y}`} x={167} y={y} width={33} height={h} fill="#000" />
        ))}
        <text transform="translate(199 560) rotate(-90)" fontSize={40} fontWeight={800} textAnchor="middle" textLength={350} lengthAdjust="spacingAndGlyphs">
          ZIPGRADE.COM
        </text>
        <text transform="translate(1118 560) rotate(-90)" fontSize={34} textAnchor="middle" textLength={260} lengthAdjust="spacingAndGlyphs">
          40-ABCDE (9467)
        </text>

        {/* ชื่อ / โรงเรียน / ห้อง */}
        <text x={233} y={230} fontSize={32}>
          Name
        </text>
        <text x={663} y={230} fontSize={32}>
          School
        </text>
        <text x={233} y={340} fontSize={32}>
          Class
        </text>
        <rect x={233} y={243} width={416} height={67} fill="none" stroke="#000" strokeWidth={3} />
        <rect x={662} y={243} width={313} height={67} fill="none" stroke="#000" strokeWidth={3} />
        <rect x={233} y={353} width={312} height={66} fill="none" stroke="#000" strokeWidth={3} />
        <text x={245} y={289} fontSize={30} textLength={name.length > 22 ? 390 : undefined} lengthAdjust="spacingAndGlyphs">
          {name}
        </text>
        <text x={674} y={289} fontSize={24} textLength={title.length > 22 ? 290 : undefined} lengthAdjust="spacingAndGlyphs">
          {title}
        </text>
        <text x={245} y={398} fontSize={26} textLength={(className ?? '').length > 20 ? 290 : undefined} lengthAdjust="spacingAndGlyphs">
          {className ?? ''}
        </text>
        {note && (
          <text x={660} y={400} fontSize={20} fill="#555">
            {note}
          </text>
        )}

        {/* คำตอบ */}
        {Array.from({ length: F.max }, (_, i) => {
          const n = i + 1
          const { col, y } = form40Slot(n)
          const xs = F.cols[col]
          const a = answers[i] ?? -1
          return (
            <g key={n}>
              <text x={xs[0] - 29} y={y + 10} fontSize={29} textAnchor="end">
                {n}
              </text>
              {xs.map((x, k) => bubble(`${n}${k}`, x, y, EXAM_LETTERS[k], i < answers.length && a === k))}
            </g>
          )
        })}

        {/* รหัสนักเรียน (ชิดซ้าย) */}
        <text x={830} y={926} fontSize={28}>
          Student ID
        </text>
        <rect x={830} y={933} width={216} height={577} fill="none" stroke="#b5b5b5" strokeWidth={1.5} />
        <line x1={830} y1={990} x2={1046} y2={990} stroke="#b5b5b5" strokeWidth={1.5} />
        {[873, 916, 960, 1003].map((x) => (
          <line key={x} x1={x} y1={933} x2={x} y2={990} stroke="#b5b5b5" strokeWidth={1.5} />
        ))}
        {F.idX.map((x, c) => (
          <g key={`id${c}`}>
            {idFits && id[c] !== undefined && (
              <text x={x} y={973} fontSize={30} textAnchor="middle">
                {id[c]}
              </text>
            )}
            {F.idY.map((y, d) => bubble(`id${c}-${d}`, x, y, String(d), idFits && id[c] === String(d)))}
          </g>
        ))}
      </svg>
    </div>
  )
}

// ---------- แบบทั่วไป (> 40 ข้อ) ----------
function GenericSheet({ title, name, zipgradeId, answers, choiceCount, note }: { title: string; name: string; zipgradeId: string; answers: number[]; choiceCount: number; note?: string }) {
  const digits = zipgradeId.replace(/\D/g, '').padStart(Math.max(5, zipgradeId.length), ' ').slice(-10).split('')
  const cols = Math.max(1, Math.ceil(answers.length / 25))
  const bubble = (on: boolean, label: string) => (
    <span className={`inline-flex h-[15px] w-[15px] items-center justify-center rounded-full border text-[8px] ${on ? 'border-black bg-black text-black' : 'border-stone-500 text-stone-500'}`}>{on ? '' : label}</span>
  )
  return (
    <div data-testid="zipgrade-sheet" className="bg-white text-black mx-auto flex flex-col gap-3 p-[12mm]" style={{ width: '210mm', minHeight: '297mm' }}>
      <div className="flex items-start justify-between border-b-2 border-black pb-2">
        <div>
          <b className="text-xl">กระดาษคำตอบ (ฝนจากการสอบออนไลน์)</b>
          <div className="text-sm">
            {title} · {name}
          </div>
          <div className="text-xs text-stone-600">เกิน 40 ข้อ — แบบทั่วไป ใช้เก็บเป็นหลักฐาน (สแกนด้วยแอป ZipGrade ไม่ได้){note ? ` · ${note}` : ''}</div>
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
