import { useCallback, useEffect, useRef, useState } from 'react'
import { fileUrl } from '../lib/upload'
import Icon from './Icon'

export type ViewFile = { key: string; title: string; fileName?: string }

const kindOf = (f: ViewFile) => {
  const ext = (f.fileName ?? f.key).split('.').pop()?.toLowerCase() ?? ''
  return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? 'image' : ext === 'pdf' ? 'pdf' : 'other'
}

/**
 * ดูไฟล์ในแอป (รูป · PDF ทุกหน้า) พร้อมแถบ "← ย้อนกลับ" ด้านบน
 * แทนการเปิดไฟล์ตรง ๆ ซึ่งในแอปที่ติดตั้งบน iPhone ไม่มีปุ่มกลับเข้าแอป
 * ปัดย้อนกลับ/ปุ่มย้อนกลับของเครื่อง = ปิดหน้าดูไฟล์ (ไม่ออกจากหน้าเดิม)
 */
export function useFileViewer() {
  const [file, setFile] = useState<ViewFile | null>(null)
  const pushed = useRef(false)
  const open = useCallback((f: ViewFile) => {
    setFile(f)
    try {
      window.history.pushState({ fileViewer: true }, '')
      pushed.current = true
    } catch {
      pushed.current = false
    }
  }, [])
  const close = useCallback(() => {
    if (pushed.current) window.history.back()
    else setFile(null)
  }, [])
  useEffect(() => {
    const onPop = () => {
      pushed.current = false
      setFile(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return { open, viewer: file ? <FileViewer file={file} onClose={close} /> : null }
}

function FileViewer({ file, onClose }: { file: ViewFile; onClose: () => void }) {
  const kind = kindOf(file)
  const url = fileUrl(file.key)
  const [pages, setPages] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ล็อกการเลื่อนหน้าข้างหลัง
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // PDF: แปลงเป็นรูปทุกหน้าในเครื่อง (iPhone เปิด PDF ในหน้าเว็บเห็นแค่หน้าแรก)
  useEffect(() => {
    if (kind !== 'pdf') return
    let live = true
    const made: string[] = []
    ;(async () => {
      try {
        const res = await fetch(url, { credentials: 'include' })
        if (!res.ok) throw new Error()
        const { pdfToImages } = await import('../lib/pdfPages')
        const blobs = await pdfToImages(await res.blob(), 60, 1200)
        if (!live) return
        made.push(...blobs.map((b) => URL.createObjectURL(b)))
        setPages(made)
      } catch {
        if (live) setError('เปิด PDF ในแอปไม่ได้ — กด “เปิด/ดาวน์โหลด” ด้านบนแทน')
      }
    })()
    return () => {
      live = false
      made.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [kind, url])

  return (
    <div role="dialog" aria-modal="true" aria-label={file.title} className="fixed inset-0 z-[60] flex flex-col bg-stone-100" data-testid="file-viewer">
      <header className="flex shrink-0 items-center gap-2 bg-board px-3 py-2 text-white shadow" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <button type="button" onClick={onClose} className="flex items-center gap-1 rounded-xl bg-white/15 px-3 py-2 font-bold" aria-label="ย้อนกลับ">
          ← ย้อนกลับ
        </button>
        <b className="min-w-0 flex-1 truncate">{file.title}</b>
        <a href={url} target="_blank" rel="noreferrer" download={file.fileName} className="shrink-0 rounded-xl bg-white/15 px-3 py-2 text-sm font-bold">
          <Icon n="download" /> เปิด/ดาวน์โหลด
        </a>
      </header>
      <div className="flex-1 overflow-auto p-2" style={{ touchAction: 'pan-x pan-y pinch-zoom' }}>
        {kind === 'image' && <img src={url} alt={file.title} className="mx-auto max-w-full rounded-lg bg-white shadow" />}
        {kind === 'pdf' &&
          (error ? (
            <p className="m-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>
          ) : !pages ? (
            <p className="m-6 text-center text-stone-500">กำลังเปิดเอกสาร…</p>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-2">
              {pages.map((p, i) => (
                <img key={p} src={p} alt={`${file.title} หน้า ${i + 1}`} className="w-full rounded bg-white shadow" />
              ))}
            </div>
          ))}
        {kind === 'other' && (
          <div className="m-6 flex flex-col items-center gap-3 text-center">
            <p className="text-stone-600">ไฟล์ {file.fileName ?? ''} เปิดดูในแอปไม่ได้ (Word/PowerPoint)</p>
            <a href={url} target="_blank" rel="noreferrer" download={file.fileName} className="rounded-xl bg-board px-4 py-2 font-bold text-white">
              <Icon n="download" /> เปิด/ดาวน์โหลดไฟล์
            </a>
            <p className="text-xs text-stone-500">ดูเสร็จแล้วกด “← ย้อนกลับ” ด้านบนเพื่อกลับมาหน้าเดิม</p>
          </div>
        )}
      </div>
    </div>
  )
}
