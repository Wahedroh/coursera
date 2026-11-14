import { useEffect, useRef, useState } from 'react'

import { pdfPageCount } from '../lib/pdf'

/** ชิ้นที่วาง/ลากเข้ามา (รูป หรือ PDF) — ตอนอัปโหลดรวมเป็น PDF ไฟล์เดียวตามลำดับ */
export type PastedPage = { id: number; blob: Blob; url: string; kind: 'image' | 'pdf'; name: string; pageCount: number | null }
let seq = 0
const isImage = (f: Blob) => f.type.startsWith('image/')
const isPdf = (f: Blob) => f.type === 'application/pdf' || (f instanceof File && /\.pdf$/i.test(f.name))

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
  // จำนวนหน้าของ PDF แต่ละชิ้น (นับแบบ async แยกจากรายการ กันอัปเดตทับกัน)
  const [counts, setCounts] = useState<Record<number, number | null>>({})
  const pagesRef = useRef(pages)
  pagesRef.current = pages

  useEffect(() => {
    if (autoFocus) zone.current?.scrollIntoView({ block: 'center' })
  }, [autoFocus])
  useEffect(() => () => pagesRef.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  /** คืนจำนวนที่รับได้ · types = ชนิดข้อมูลที่พบในคลิปบอร์ด (ไว้บอกครูเมื่อไม่พบรูป) */
  function add(files: Blob[], types: string[] = []): number {
    const usable = files.filter((f) => isImage(f) || isPdf(f))
    // ไฟล์ชนิดอื่น (Word/PowerPoint) ใช้เป็นไฟล์เดี่ยวแบบเดิม
    const other = files.find((f) => !isImage(f) && !isPdf(f) && f instanceof File) as File | undefined
    if (other) onFile(other)
    if (usable.length) {
      const added: PastedPage[] = usable.map((blob) => ({
        id: ++seq,
        blob,
        url: URL.createObjectURL(blob),
        kind: isPdf(blob) ? 'pdf' : 'image',
        name: blob instanceof File ? blob.name : isPdf(blob) ? 'PDF' : 'รูป',
        pageCount: isPdf(blob) ? null : 1,
      }))
      onPages([...pagesRef.current, ...added])
      setMsg(`เพิ่ม ${added.length} ชิ้น · รวมเป็น PDF ไฟล์เดียวตอนอัปโหลด`)
      // นับหน้าของ PDF ที่ลากมา
      for (const a of added.filter((x) => x.kind === 'pdf'))
        void pdfPageCount(a.blob).then((n) => setCounts((c) => ({ ...c, [a.id]: n })))
    } else if (other) setMsg(`ได้ไฟล์ ${other.name}`)
    else {
      const seen = [...new Set(types)].filter(Boolean)
      setMsg(
        `ไม่พบรูปในคลิปบอร์ด${seen.length ? ` (พบข้อมูลชนิด: ${seen.join(', ')})` : ''} — ลองวิธีที่ 1 หรือ 2 ใน “วิธีคัดลอกจาก GoodNotes” ด้านล่าง`,
      )
    }
    return usable.length + (other ? 1 : 0)
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
          <b className="block text-base">✋ ลากหน้าที่จด / ไฟล์ PDF จาก GoodNotes มาปล่อยที่นี่</b>
          <span className="text-stone-500">ลากได้หลายครั้ง ระบบต่อกันตามลำดับแล้วรวมเป็น PDF ไฟล์เดียว · รูปภาพแตะค้างแล้ว “วาง” ได้ด้วย</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void pasteButton()} className="rounded-xl bg-amber-400 text-amber-950 px-3 py-1.5 text-sm font-bold">
          📋 วางจากคลิปบอร์ด
        </button>
        {msg && <span className="text-xs text-stone-600">{msg}</span>}
      </div>
      <details className="text-xs text-stone-500" open>
        <summary className="cursor-pointer font-semibold">วิธีลากจาก GoodNotes</summary>
        <ol className="list-decimal pl-5 mt-1 space-y-1">
          <li>
            เปิด <b>GoodNotes คู่กับแอปนี้แบบแบ่งจอ (Split View)</b>: ปัดขึ้นจากขอบล่างเล็กน้อยให้เห็น Dock → ลากไอคอน GoodNotes ไปวางข้างจอ
          </li>
          <li>
            ใน GoodNotes เปิด <b>หน้าย่อ (ไอคอนตาราง)</b> → <b>แตะค้างที่หน้า</b> แล้วลากมาปล่อยในกรอบด้านบน
          </li>
          <li>
            <b>ลากหลายหน้าทีเดียว:</b> แตะค้างหน้าแรกแล้วขยับเล็กน้อย จากนั้นใช้อีกนิ้ว<b>แตะหน้าอื่นเพิ่ม</b> (ซ้อนเป็นกอง) แล้วลากทั้งกองมาปล่อย · หรือลากทีละหน้าหลายครั้งก็ได้
          </li>
          <li>
            เรียงลำดับด้วย ◀ ▶ ใต้รูปย่อ แล้วกด <b>อัปโหลด</b> → ได้ PDF ไฟล์เดียว
          </li>
        </ol>
        <p className="mt-1">ภาพหน้าจอ iPad (คัดลอกและลบ) วางในกรอบได้เช่นกัน · ไฟล์ Word/PowerPoint ใช้ช่อง “หรือเลือกไฟล์”</p>
      </details>
      {pages.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1" data-testid="pasted-pages">
          {pages.map((p, i) => (
            <figure key={p.id} className="shrink-0 w-28 rounded-xl border border-line bg-white p-1 flex flex-col gap-1">
              {p.kind === 'image' ? (
                <img src={p.url} alt={`หน้าที่ ${i + 1}`} className="h-32 w-full object-contain bg-stone-50 rounded-lg" />
              ) : (
                <div role="img" aria-label={`PDF ชิ้นที่ ${i + 1}`} className="h-32 w-full rounded-lg bg-red-50 flex flex-col items-center justify-center text-center px-1">
                  <span className="text-2xl">📄</span>
                  <span className="text-[10px] text-stone-600 break-all line-clamp-2">{p.name}</span>
                  <b className="text-xs text-red-700">{(counts[p.id] ?? p.pageCount) == null ? 'PDF' : `${counts[p.id] ?? p.pageCount} หน้า`}</b>
                </div>
              )}
              <figcaption className="flex items-center justify-between text-xs">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`เลื่อนหน้า ${i + 1} ขึ้น`} className="px-1 disabled:opacity-30">
                  ◀
                </button>
                <b>ชิ้น {i + 1}</b>
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
