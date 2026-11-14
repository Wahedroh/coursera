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

  /** คืนจำนวนที่รับได้ · types = ชนิดข้อมูลที่พบในคลิปบอร์ด (ไว้บอกครูเมื่อไม่พบรูป) */
  function add(files: Blob[], types: string[] = []): number {
    const imgs = files.filter(isImage)
    const pdf = files.find((f) => f.type === 'application/pdf')
    if (pdf) onFile(pdf instanceof File ? pdf : new File([pdf], 'จดในห้อง.pdf', { type: 'application/pdf' }))
    if (imgs.length) {
      onPages([...pagesRef.current, ...imgs.map((blob) => ({ id: ++seq, blob, url: URL.createObjectURL(blob) }))])
      setMsg(`เพิ่ม ${imgs.length} หน้า`)
    } else if (pdf) setMsg('ได้ไฟล์ PDF แล้ว')
    else {
      const seen = [...new Set(types)].filter(Boolean)
      setMsg(
        `ไม่พบรูปในคลิปบอร์ด${seen.length ? ` (พบข้อมูลชนิด: ${seen.join(', ')})` : ''} — ลองวิธีที่ 1 หรือ 2 ใน “วิธีคัดลอกจาก GoodNotes” ด้านล่าง`,
      )
    }
    return imgs.length + (pdf ? 1 : 0)
  }

  /** รูปที่ฝังมาเป็น HTML (<img src="data:…">) */
  async function imagesFromHtml(html: string): Promise<Blob[]> {
    const out: Blob[] = []
    for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/gi)) {
      const src = m[1].replace(/&amp;/g, '&')
      if (!/^(data:image|blob:)/.test(src)) continue
      try {
        out.push(await (await fetch(src)).blob())
      } catch {
        /* ข้ามรูปที่อ่านไม่ได้ */
      }
    }
    return out
  }

  /** Safari บางครั้งไม่ให้ไฟล์ใน clipboardData แต่ใส่ <img> ลงในกรอบ — ดึงรูปจากกรอบแล้วล้างทิ้ง */
  async function harvestInserted(el: HTMLElement) {
    const imgs = [...el.querySelectorAll('img')]
    const blobs: Blob[] = []
    for (const img of imgs) {
      try {
        blobs.push(await (await fetch(img.src)).blob())
      } catch {
        /* ข้าม */
      }
    }
    el.querySelectorAll(':scope > :not([data-keep])').forEach((n) => n.remove())
    for (const n of [...el.childNodes]) if (n.nodeType === Node.TEXT_NODE) n.remove()
    if (imgs.length) add(blobs, ['image (แทรกในกรอบ)'])
  }

  async function pasteButton() {
    setMsg(null)
    try {
      const items = await navigator.clipboard.read()
      const blobs: Blob[] = []
      const types: string[] = []
      for (const it of items) {
        types.push(...it.types)
        const type = it.types.find((t) => t.startsWith('image/') || t === 'application/pdf')
        if (type) blobs.push(await it.getType(type))
        else if (it.types.includes('text/html')) blobs.push(...(await imagesFromHtml(await (await it.getType('text/html')).text())))
      }
      add(blobs, types)
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
          const dt = e.clipboardData
          const files: Blob[] = [...dt.files]
          // บางแอปให้รูปเป็น item ชนิด file แต่ไม่อยู่ใน files
          if (!files.length)
            for (const it of [...dt.items]) {
              const f = it.kind === 'file' ? it.getAsFile() : null
              if (f) files.push(f)
            }
          const types = [...dt.types]
          if (files.length) {
            e.preventDefault()
            add(files, types)
            return
          }
          const html = dt.getData('text/html')
          if (html && /<img/i.test(html)) {
            e.preventDefault()
            void imagesFromHtml(html).then((b) => add(b, types))
            return
          }
          // ไม่มีไฟล์ให้อ่าน: ปล่อยให้ Safari แทรกลงกรอบก่อน แล้วค่อยดึงรูปออกมา
          const el = e.currentTarget
          window.setTimeout(() => {
            if (el.querySelector('img')) void harvestInserted(el)
            else {
              el.querySelectorAll(':scope > :not([data-keep])').forEach((n) => n.remove())
              for (const n of [...el.childNodes]) if (n.nodeType === Node.TEXT_NODE) n.remove()
              add([], types)
            }
          }, 50)
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
          // ไม่ให้พิมพ์ข้อความลงกรอบ (รูปที่ถูกแทรกเก็บไว้ให้ onPaste ดึงออก)
          const el = e.currentTarget
          if (el.querySelector('img')) return
          for (const n of [...el.childNodes]) if (n.nodeType === Node.TEXT_NODE) n.remove()
        }}
        className={`min-h-28 rounded-2xl border-2 border-dashed px-4 py-5 text-center text-sm outline-none caret-transparent ${over ? 'border-board bg-board-soft' : 'border-amber-300 bg-amber-50'} focus:border-board`}
      >
        <span contentEditable={false} data-keep className="pointer-events-none select-none">
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
      <details className="text-xs text-stone-500" open>
        <summary className="cursor-pointer font-semibold">วิธีคัดลอกจาก GoodNotes (ให้ได้เป็นรูป)</summary>
        <ol className="list-decimal pl-5 mt-1 space-y-1">
          <li>
            <b>ถ่ายภาพหน้าจอ iPad (แนะนำ):</b> เปิดหน้าที่จดให้เต็มจอ → กด <b>ปุ่มด้านบน + ปุ่มเพิ่มเสียง</b> พร้อมกัน (หรือใช้ Pencil ปัดจากมุมล่างเข้าหาจอ) → แตะภาพย่อที่มุมจอ → ครอปได้ → แตะ <b>เสร็จสิ้น</b> → เลือก{' '}
            <b>“คัดลอกและลบ”</b> → มาแตะค้างในกรอบด้านบน → <b>วาง</b>
          </li>
          <li>
            <b>บ่วงบาศใน GoodNotes:</b> ใช้เครื่องมือบ่วงบาศล้อมส่วนที่จด → แตะในกรอบ → <b>ถ่ายภาพหน้าจอ</b> → เลือก <b>คัดลอก</b> → มาวางที่นี่
          </li>
          <li>
            <b>ทั้งเล่มเป็น PDF:</b> ใน GoodNotes กด <b>แชร์/ส่งออก → PDF → บันทึกไปยังไฟล์</b> แล้วใช้ช่อง <b>“หรือเลือกไฟล์”</b> ด้านล่าง หรือเปิดคู่กันแบบแบ่งจอ (Split View) แล้วลากไฟล์มาปล่อยในกรอบ
          </li>
        </ol>
        <p className="mt-1">
          หมายเหตุ: <b>“คัดลอกหน้า”</b> จากหน้าย่อของ GoodNotes ได้เป็นหน้า GoodNotes (ไม่ใช่รูป) จึงวางในเว็บไม่ได้ ถ้าวางไม่ได้ ระบบจะบอกชนิดข้อมูลที่พบ ส่งข้อความนั้นให้ผู้ดูแลได้
        </p>
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
