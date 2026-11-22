/** แปลง PDF เป็นรูปทีละหน้า (ทำในเครื่องครู · ใช้เป็นหน้าข้อสอบที่นักเรียนเห็นพร้อมลายน้ำ) */
export async function pdfToImages(file: Blob, maxPages = 40, width = 1400): Promise<Blob[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const out: Blob[] = []
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const page = await doc.getPage(i)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: width / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    out.push(await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('แปลงหน้า PDF ไม่สำเร็จ'))), 'image/jpeg', 0.85)))
  }
  return out
}
