import qrcode from 'qrcode-generator'
import { cardPayload } from '../../shared/cardgame'

/** QR ของการ์ด (SVG เป็นช่อง ๆ คมชัดทุกขนาด) — โหมดตัวอักษร+ตัวเลข ทำให้ช่องใหญ่ อ่านได้ไกล */
export function qrSvg(text: string, mode: 'Alphanumeric' | 'Byte' = 'Alphanumeric') {
  const q = qrcode(0, 'L')
  q.addData(text, mode)
  q.make()
  const n = q.getModuleCount()
  let d = ''
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + 2} ${y + 2}h1v1h-1z`
  return { n: n + 4, d }
}

/** การ์ด 1 ใบ: QR กลาง · A บน · B ขวา · C ล่าง · D ซ้าย (ตัวเล็ก) · เลขที่/ชื่อ มุมล่างขวา */
export default function QrCard({ zipgradeId, label, sizeMm }: { zipgradeId: string; label: string; sizeMm: number }) {
  const text = cardPayload(zipgradeId.toUpperCase())
  // ตัวอักษรที่โหมด Alphanumeric รับได้ — นอกนั้นใช้ Byte (ช่องเล็กลงเล็กน้อย)
  const { n, d } = qrSvg(text, /^[0-9A-Z $%*+\-./:]*$/.test(text) ? 'Alphanumeric' : 'Byte')
  const letter = (l: string, style: React.CSSProperties) => (
    <span className="absolute font-extrabold text-stone-500" style={{ fontSize: `${sizeMm * 0.06}mm`, lineHeight: 1, ...style }}>
      {l}
    </span>
  )
  return (
    <div className="relative bg-white border border-dashed border-stone-300 flex items-center justify-center break-inside-avoid" style={{ width: `${sizeMm}mm`, height: `${sizeMm}mm` }} data-testid="qr-card">
      <svg viewBox={`0 0 ${n} ${n}`} style={{ width: `${sizeMm * 0.8}mm`, height: `${sizeMm * 0.8}mm` }} shapeRendering="crispEdges" aria-label={`การ์ด ${label}`}>
        <rect width={n} height={n} fill="#fff" />
        <path d={d} fill="#000" />
      </svg>
      {letter('A', { top: '2%', left: '50%', transform: 'translateX(-50%)' })}
      {letter('B', { right: '2%', top: '50%', transform: 'translateY(-50%) rotate(90deg)' })}
      {letter('C', { bottom: '2%', left: '50%', transform: 'translateX(-50%) rotate(180deg)' })}
      {letter('D', { left: '2%', top: '50%', transform: 'translateY(-50%) rotate(-90deg)' })}
      <span className="absolute text-stone-400" style={{ right: '6%', bottom: '4%', fontSize: `${Math.max(2.2, sizeMm * 0.028)}mm` }}>
        {label}
      </span>
    </div>
  )
}
