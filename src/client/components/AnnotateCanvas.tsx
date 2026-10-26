import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

type Tool = 'pen' | 'highlight' | 'text' | 'erase'
type Stroke =
  | { kind: 'line'; tool: 'pen' | 'highlight' | 'erase'; color: string; size: number; points: [number, number][] }
  | { kind: 'text'; color: string; size: number; x: number; y: number; text: string }

export type AnnotateHandle = { hasChanges(): boolean; toBlob(): Promise<Blob> }

const COLORS = ['#E53935', '#222222', '#1E63D6', '#2E9D6A', '#F59E0B']
const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'pen', label: 'ปากกา', icon: '✏️' },
  { id: 'highlight', label: 'ไฮไลต์', icon: '🖍️' },
  { id: 'text', label: 'ข้อความ', icon: 'T' },
  { id: 'erase', label: 'ยางลบ', icon: '⌫' },
]

/** วาดทับรูปงาน: รูปเดิมอยู่ชั้นล่าง เส้น/ข้อความอยู่ชั้นบน (ยางลบลบเฉพาะชั้นบน) */
export const AnnotateCanvas = forwardRef<AnnotateHandle, { src: string; label: string }>(function AnnotateCanvas({ src, label }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const current = useRef<Stroke | null>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(4)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const c = canvasRef.current!
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
      c.width = Math.max(300, Math.round(img.naturalWidth * scale))
      c.height = Math.max(300, Math.round(img.naturalHeight * scale))
      setReady(true)
    }
    img.src = src
  }, [src])

  useEffect(() => {
    if (ready) redraw()
  })

  function redraw() {
    const c = canvasRef.current
    const img = imgRef.current
    if (!c || !img) return
    const ctx = c.getContext('2d')!
    const overlay = document.createElement('canvas')
    overlay.width = c.width
    overlay.height = c.height
    const o = overlay.getContext('2d')!
    for (const s of current.current ? [...strokes, current.current] : strokes) {
      if (s.kind === 'text') {
        o.globalCompositeOperation = 'source-over'
        o.globalAlpha = 1
        o.fillStyle = s.color
        o.font = `bold ${s.size * 6}px 'Noto Sans Thai', sans-serif`
        o.fillText(s.text, s.x, s.y)
        continue
      }
      o.globalCompositeOperation = s.tool === 'erase' ? 'destination-out' : 'source-over'
      o.globalAlpha = s.tool === 'highlight' ? 0.35 : 1
      o.strokeStyle = s.color
      o.lineWidth = s.tool === 'highlight' ? s.size * 4 : s.tool === 'erase' ? s.size * 5 : s.size
      o.lineCap = 'round'
      o.lineJoin = 'round'
      o.beginPath()
      s.points.forEach(([x, y], i) => (i ? o.lineTo(x, y) : o.moveTo(x, y)))
      if (s.points.length === 1) o.lineTo(s.points[0][0] + 0.1, s.points[0][1])
      o.stroke()
    }
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    ctx.drawImage(overlay, 0, 0)
  }

  function pos(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const r = e.currentTarget.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * e.currentTarget.width, ((e.clientY - r.top) / r.height) * e.currentTarget.height]
  }

  useImperativeHandle(ref, () => ({
    hasChanges: () => strokes.length > 0,
    toBlob: () =>
      new Promise((resolve, reject) => canvasRef.current!.toBlob((b) => (b ? resolve(b) : reject(new Error('export failed'))), 'image/png')),
  }))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5 bg-white border border-line rounded-xl p-2" role="toolbar" aria-label={`เครื่องมือ ${label}`}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={t.label}
            aria-pressed={tool === t.id}
            onClick={() => setTool(t.id)}
            className={`w-9 h-9 rounded-lg font-bold ${tool === t.id ? 'bg-board-soft ring-2 ring-board' : 'bg-stone-100'}`}
          >
            {t.icon}
          </button>
        ))}
        <span className="w-px h-6 bg-line mx-1" />
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`สี ${c}`}
            onClick={() => setColor(c)}
            className={`w-6 h-6 rounded-full ${color === c ? 'ring-4 ring-offset-1 ring-stone-300' : ''}`}
            style={{ background: c }}
          />
        ))}
        <span className="w-px h-6 bg-line mx-1" />
        <label className="text-xs text-stone-500 flex items-center gap-1">
          ขนาด
          <input type="range" min={2} max={12} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-20" />
        </label>
        <button type="button" aria-label="ย้อนกลับ" onClick={() => setStrokes(strokes.slice(0, -1))} className="w-9 h-9 rounded-lg bg-stone-100 font-bold">
          ↶
        </button>
      </div>
      <canvas
        ref={canvasRef}
        data-testid="annotate-canvas"
        aria-label={label}
        className="w-full h-auto rounded-xl border border-line bg-white touch-none cursor-crosshair"
        onPointerDown={(e) => {
          const p = pos(e)
          if (tool === 'text') {
            const text = window.prompt('พิมพ์ข้อความ')
            if (text) setStrokes([...strokes, { kind: 'text', color, size, x: p[0], y: p[1], text }])
            return
          }
          e.currentTarget.setPointerCapture(e.pointerId)
          current.current = { kind: 'line', tool, color, size, points: [p] }
          redraw()
        }}
        onPointerMove={(e) => {
          if (current.current?.kind !== 'line') return
          current.current.points.push(pos(e))
          redraw()
        }}
        onPointerUp={() => {
          if (current.current) setStrokes([...strokes, current.current])
          current.current = null
        }}
      />
    </div>
  )
})
