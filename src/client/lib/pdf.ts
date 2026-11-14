/** แปลงหน้า A4 ในหน้าเว็บเป็นไฟล์ PDF ในเครื่องผู้ใช้ (ไม่ส่งข้อมูลขึ้นเซิร์ฟเวอร์) */
export async function downloadA4Pdf(el: HTMLElement, fileName: string): Promise<void> {
  const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')])
  await document.fonts.ready
  const png = await toPng(el, { pixelRatio: 2.5, backgroundColor: '#ffffff', style: { margin: '0', boxShadow: 'none', transform: 'none' } })
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  pdf.addImage(png, 'PNG', 0, 0, 210, 297)
  pdf.save(fileName)
}

/**
 * รวมหลายชิ้น (PDF ที่ลากมาจาก GoodNotes และ/หรือรูป) เป็น PDF ไฟล์เดียวตามลำดับ
 * มี PDF ชิ้นเดียว = ใช้ไฟล์เดิมเลย (ไม่แปลงซ้ำ)
 */
export async function combineToPdf(items: { blob: Blob; kind: 'image' | 'pdf' }[]): Promise<Blob> {
  if (items.length === 1 && items[0].kind === 'pdf') return items[0].blob
  const [{ PDFDocument }, { resizeImage }] = await Promise.all([import('pdf-lib'), import('./image')])
  const out = await PDFDocument.create()
  for (const it of items) {
    if (it.kind === 'pdf') {
      const src = await PDFDocument.load(await it.blob.arrayBuffer(), { ignoreEncryption: true })
      for (const page of await out.copyPages(src, src.getPageIndices())) out.addPage(page)
    } else {
      const jpg = await out.embedJpg(await (await resizeImage(it.blob, 2000, 0.85)).arrayBuffer())
      const w = 595
      const h = Math.round((jpg.height / jpg.width) * w)
      out.addPage([w, h]).drawImage(jpg, { x: 0, y: 0, width: w, height: h })
    }
  }
  const bytes = await out.save()
  return new Blob([bytes.slice()], { type: 'application/pdf' })
}

/** จำนวนหน้าของไฟล์ PDF (อ่านไม่ได้ = null) */
export async function pdfPageCount(blob: Blob): Promise<number | null> {
  try {
    const { PDFDocument } = await import('pdf-lib')
    return (await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true })).getPageCount()
  } catch {
    return null
  }
}
