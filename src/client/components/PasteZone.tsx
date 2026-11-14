import { useEffect, useRef, useState } from 'react'

export type PastedPage = { id: number; blob: Blob; url: string }
let seq = 0
const isImage = (f: Blob) => f.type.startsWith('image/')

/**
 * ช่องวางเอกสารที่จด: วางรูปจากคลิปบอร์ด (แตะค้าง → วาง หรือปุ่ม “วางจากคลิปบอร์ด”) หรือลากไฟล์มาปล่อย
 * รูปหลายหน้าจะถูกรวมเป็น PDF ไฟล์เดียวตอนอัปโหลด · ไฟล์ PDF ที่ลากมาใช้ทั้งไฟล์
 */
export default function PasteZone({
  pages,
  onPages,
  onFile,
  autoFocus,
}: {
  pages: PastedPage[]
  onPages: (p: PastedPage[]) => void
  /** ไฟล์ที่ไม่ใช่รูป (เช่น PDF ทั้งเล่ม) ที่ลาก/วางเข้ามา */
  onFile: (f: File) => void
  autoFocus?: boolean
}) {
  const zone = useRef<HTMLDivElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const pagesRef = useRef(pages)
  pagesRef.current = pages

  useEffect(() => {
    if (autoFocus) zone.current?.scrollIntoView({ block: 'center' })
  }, [autoFocus])
  useEffect(() => () => pagesRef.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  function add(files: Blob[]) {
    const imgs = files.filter(isImage)
    const other = files.find((f) => !isImage(f) && f instanceof File) as File | undefined
    if (other) onFile(other)
    if (imgs.length) {
      onPages([...pagesRef.current, ...imgs.map((blob) => ({ id: ++seq, blob, url: URL.createObjectURL(blob) }))])
      setMsg(`เพิ่ม ${imgs.length} หน้า`)
    } else if (!other) setMsg('ไม่พบรูปในคลิปบอร์ด — ใน GoodNotes ให้เลือกหน้า/บ่วงเลือกแล้วกด “คัดลอก” ก่อน')
  }

  async function pasteButton() {
    setMsg(null)
    try {
      const items = await navigator.clipboard.read()
      const blobs: Blob[] = []
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith('image/'))
        if (type) blobs.push(await it.getType(type))
      }
      add(blobs)
    } catch {
      setMsg('เบราว์เซอร์ไม่ให้อ่านคลิปบอร์ด — แตะค้างในกรอบแล้วเลือก “วาง” แทน')
    }
  }

  const move = (i: number, d: number) => {
    const next = [...pages]
    const [p] = next.splice(i, 1)
    next.splice(i + d, 0, p)
    onPages(next)
  }
  const remove = (i: number) => {
    URL.revokeObjectURL(pages[i].url)
    onPages(pages.filter((_, j) => j !== i))
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={zone}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        // ไม่ให้แป้นพิมพ์ iPad เด้งขึ้น — แตะค้างแล้วเลือก “วาง” ได้
        inputMode="none"
        aria-label="ช่องวางเอกสารที่จด"
        data-testid="paste-zone"
        onPaste={(e) => {
          e.preventDefault()
          add([...e.clipboardData.files])
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          add([...e.dataTransfer.files])
        }}
        onInput={(e) => {
          // ไม่ให้พิมพ์ข้อความลงกรอบ
          e.currentTarget.textContent = ''
        }}
        className={`min-h-28 rounded-2xl border-2 border-dashed px-4 py-5 text-center text-sm outline-none caret-transparent ${over ? 'border-board bg-board-soft' : 'border-amber-300 bg-amber-50'} focus:border-board`}
      >
        <span contentEditable={false} className="pointer-events-none select-none">
          <b className="block text-base">📋 แตะค้างในกรอบนี้ แล้วเลือก “วาง”</b>
          <span className="text-stone-500">หรือลากไฟล์ PDF/รูปมาปล่อย · วางได้หลายหน้า ระบบรวมเป็น PDF ไฟล์เดียวให้</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void pasteButton()} className="rounded-xl bg-amber-400 text-amber-950 px-3 py-1.5 text-sm font-bold">
          📋 วางจากคลิปบอร์ด
        </button>
        {msg && <span className="text-xs text-stone-600">{msg}</span>}
      </div>
      <details className="text-xs text-stone-500">
        <summary className="cursor-pointer font-semibold">วิธีคัดลอกจาก GoodNotes</summary>
        <ol className="list-decimal pl-5 mt-1 space-y-0.5">
          <li>
            <b>ทั้งหน้า:</b> แตะไอคอนหน้า (มุมบน) หรือมุมมองหน้าเล็ก → เลือกหน้าที่ต้องการ → <b>คัดลอก</b> (ได้เป็นรูปหน้าละ 1 รูป)
          </li>
          <li>
            <b>บางส่วน:</b> ใช้ <b>เครื่องมือบ่วงบาศ</b> ล้อมส่วนที่จด → แตะในกรอบ → <b>ถ่ายภาพหน้าจอ/คัดลอก</b>
          </li>
          <li>กลับมาที่แอปนี้ แตะค้างในกรอบด้านบน → <b>วาง</b> (ทำซ้ำได้ทีละหน้า)</li>
          <li>
            <b>ทั้งไฟล์ PDF:</b> เปิด GoodNotes กับแอปนี้แบบแบ่งจอ (Split View) แล้วลากไฟล์มาปล่อยในกรอบ หรือส่งออกเป็น PDF ไว้ในแอปไฟล์ แล้วใช้ช่อง “ไฟล์” ด้านล่าง
          </li>
        </ol>
      </details>
      {pages.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1" data-testid="pasted-pages">
          {pages.map((p, i) => (
            <figure key={p.id} className="shrink-0 w-28 rounded-xl border border-line bg-white p-1 flex flex-col gap-1">
              <img src={p.url} alt={`หน้าที่ ${i + 1}`} className="h-32 w-full object-contain bg-stone-50 rounded-lg" />
              <figcaption className="flex items-center justify-between text-xs">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`เลื่อนหน้า ${i + 1} ขึ้น`} className="px-1 disabled:opacity-30">
                  ◀
                </button>
                <b>หน้า {i + 1}</b>
                <button type="button" disabled={i === pages.length - 1} onClick={() => move(i, 1)} aria-label={`เลื่อนหน้า ${i + 1} ลง`} className="px-1 disabled:opacity-30">
                  ▶
                </button>
              </figcaption>
              <button type="button" onClick={() => remove(i)} className="text-xs text-red-700 underline" aria-label={`ลบหน้า ${i + 1}`}>
                ลบ
              </button>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}
