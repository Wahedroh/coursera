import { useState, type ReactNode } from 'react'

export type Series = { name: string; color: string }
export type BarRow = { key: string; label: string; segments: number[]; tip: ReactNode }

/** แท่งแนวตั้ง (ซ้อนได้) — แกน y เดียว เส้นกริดจาง ชี้/แตะแท่งเพื่อดูรายละเอียด · มีปุ่มสลับเป็นตาราง */
export default function BarChart({
  rows,
  series,
  max,
  unit = '',
  title,
  table,
  selected,
  onSelect,
  emptyText = 'ยังไม่มีข้อมูล',
}: {
  rows: BarRow[]
  series: Series[]
  max: number
  unit?: string
  title: string
  table: { head: string[]; body: (string | number)[][] }
  selected?: string
  onSelect?: (key: string) => void
  emptyText?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f))
  const top = Math.max(1, max)
  return (
    <figure className="flex flex-col gap-2" aria-label={title}>
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-sm">{title}</b>
        <span className="flex items-center gap-3 text-xs text-stone-600">
          {series.length > 1 &&
            series.map((s) => (
              <span key={s.name} className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: s.color }} aria-hidden />
                {s.name}
              </span>
            ))}
          <button type="button" className="underline" onClick={() => setAsTable((v) => !v)}>
            {asTable ? 'ดูกราฟ' : 'ดูเป็นตาราง'}
          </button>
        </span>
      </figcaption>
      {rows.length === 0 ? (
        <p className="text-sm text-stone-500 py-6 text-center">{emptyText}</p>
      ) : asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-500">
                {table.head.map((h) => (
                  <th key={h} className="py-1 pr-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.body.map((r, i) => (
                <tr key={i} className="border-t border-stone-100">
                  {r.map((c, j) => (
                    <td key={j} className={`py-1 pr-3 ${j ? 'tabular-nums' : ''}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-2">
          {/* แกน y */}
          <div className="relative h-44 w-9 shrink-0 text-[10px] text-stone-400 tabular-nums">
            {ticks.map((v) => (
              <span key={v} className="absolute right-0" style={{ bottom: `${(v / top) * 100}%`, transform: 'translateY(50%)' }}>
                {v}
                {unit}
              </span>
            ))}
          </div>
          <div className="flex-1 min-w-0 overflow-x-auto">
            <div className="relative h-44" style={{ minWidth: `${rows.length * 28}px` }} onMouseLeave={() => setHover(null)}>
              {ticks.map((v) => (
                <span key={v} className={`absolute inset-x-0 border-t ${v === 0 ? 'border-stone-300' : 'border-stone-100'}`} style={{ bottom: `${(v / top) * 100}%` }} aria-hidden />
              ))}
              <div className="absolute inset-0 flex items-end gap-[2px]">
                {rows.map((r, i) => {
                  const total = r.segments.reduce((a, b) => a + b, 0)
                  const active = hover === i || selected === r.key
                  return (
                    <button
                      key={r.key}
                      type="button"
                      className={`relative flex-1 h-full flex flex-col-reverse items-stretch min-w-[14px] max-w-14 mx-auto rounded-t ${active ? 'bg-stone-100/70' : ''}`}
                      onMouseEnter={() => setHover(i)}
                      onFocus={() => setHover(i)}
                      onBlur={() => setHover(null)}
                      onClick={() => (onSelect ? onSelect(r.key) : setHover(i))}
                      aria-label={`${r.label}`}
                    >
                      {r.segments.map((v, k) => {
                        const isTop = r.segments.slice(k + 1).every((x) => x === 0)
                        return v > 0 ? (
                          <span
                            key={k}
                            className={`block w-full ${isTop ? 'rounded-t' : ''} ${k > 0 ? 'border-b-2 border-white' : ''}`}
                            style={{ height: `${(v / top) * 100}%`, background: series[k].color }}
                          />
                        ) : null
                      })}
                      {total === 0 && <span className="block w-full h-[2px] bg-stone-300" />}
                      {hover === i && (
                        <span
                          role="tooltip"
                          className={`absolute z-10 top-1 w-max max-w-56 rounded-lg bg-stone-900 text-white text-xs text-left px-2 py-1.5 shadow-lg pointer-events-none ${
                            i > rows.length / 2 ? 'right-0' : 'left-0'
                          }`}
                        >
                          {r.tip}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex gap-[2px] mt-1" style={{ minWidth: `${rows.length * 28}px` }}>
              {rows.map((r) => (
                <span key={r.key} className="flex-1 min-w-[14px] max-w-14 mx-auto text-[10px] text-stone-500 text-center truncate" title={r.label}>
                  {r.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </figure>
  )
}
