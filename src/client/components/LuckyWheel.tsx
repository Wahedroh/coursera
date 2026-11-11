import { useState } from 'react'
import { api, ApiClientError } from '../api'
import { WHEEL, type WheelState } from '../../shared/quests'

const COLORS = ['#F2B544', '#4F7FE8', '#E8782E', '#9B5DE5', '#2E7D5B', '#E53935', '#F27BA6', '#26A69A']
const R = 130
const N = WHEEL.length

/** วงล้อนำโชค: ผลสุ่มมาจากเซิร์ฟเวอร์ แล้ววงล้อหมุนไปหยุดที่ช่องนั้น */
export default function LuckyWheel({ onClose, onDone }: { onClose: () => void; onDone: (s: WheelState) => void }) {
  const [deg, setDeg] = useState(0)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<WheelState['spun']>(null)
  const [error, setError] = useState<string | null>(null)

  async function spin() {
    setBusy(true)
    setError(null)
    try {
      const s = await api<WheelState>('/api/student/quests/wheel/spin', { body: {} })
      const i = s.spun!.index
      // ให้กึ่งกลางช่อง i มาอยู่ใต้เข็มด้านบน + หมุน 6 รอบ
      setDeg(360 * 6 + (360 - (i + 0.5) * (360 / N)))
      setTimeout(() => {
        setResult(s.spun)
        onDone(s)
      }, 4200)
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'หมุนไม่สำเร็จ')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !busy || result ? onClose() : undefined}>
      <div role="dialog" aria-label="วงล้อนำโชค" className="bg-white rounded-3xl p-5 w-full max-w-sm flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <b className="text-lg">🎡 วงล้อนำโชคประจำสัปดาห์</b>
        <div className="relative">
          <svg width="280" height="280" viewBox="-150 -150 300 300" aria-hidden>
            <g style={{ transform: `rotate(${deg}deg)`, transition: deg ? 'transform 4s cubic-bezier(.17,.67,.21,1)' : 'none' }}>
              {WHEEL.map((exp, i) => {
                const a0 = (i / N) * 2 * Math.PI - Math.PI / 2
                const a1 = ((i + 1) / N) * 2 * Math.PI - Math.PI / 2
                const am = (a0 + a1) / 2
                const tx = 88 * Math.cos(am)
                const ty = 88 * Math.sin(am)
                return (
                  <g key={i}>
                    <path d={`M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 0 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`} fill={COLORS[i]} stroke="#fff" strokeWidth="3" />
                    <text x={tx} y={ty} fontSize="17" fontWeight="800" fill="#fff" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${(am * 180) / Math.PI + 90} ${tx} ${ty})`}>
                      +{exp}
                    </text>
                  </g>
                )
              })}
            </g>
            <circle r="26" fill="#fff" stroke="#1f5e46" strokeWidth="5" />
            <text y="6" fontSize="14" fontWeight="800" textAnchor="middle" fill="#1f5e46">
              EXP
            </text>
            <polygon points="-14,-148 14,-148 0,-118" fill="#1e2a26" />
          </svg>
        </div>
        {result ? (
          <p className="text-xl font-extrabold text-board" data-testid="wheel-result">
            🎉 ได้ +{result.exp} EXP!
          </p>
        ) : (
          <button type="button" disabled={busy} onClick={() => void spin()} className="w-full rounded-xl bg-amber-400 text-amber-950 px-4 py-3 text-lg font-extrabold disabled:opacity-60">
            {busy ? 'กำลังหมุน…' : 'หมุนเลย!'}
          </button>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        {(result || !busy) && (
          <button type="button" className="text-sm text-stone-500" onClick={onClose}>
            ปิด
          </button>
        )}
      </div>
    </div>
  )
}
