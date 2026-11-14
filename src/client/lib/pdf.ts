/** แปลงหน้า A4 ในหน้าเว็บเป็นไฟล์ PDF ในเครื่องผู้ใช้ (ไม่ส่งข้อมูลขึ้นเซิร์ฟเวอร์) */
export async function downloadA4Pdf(el: HTMLElement, fileName: string): Promise<void> {
  const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')])
  await document.fonts.ready
  const png = await toPng(el, { pixelRatio: 2.5, backgroundColor: '#ffffff', style: { margin: '0', boxShadow: 'none', transform: 'none' } })
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  pdf.addImage(png, 'PNG', 0, 0, 210, 297)
  pdf.save(fileName)
}

/** รวมรูปหลายหน้า (เช่น หน้าที่จดใน GoodNotes ที่คัดลอกมาวาง) เป็น PDF ไฟล์เดียว · แต่ละหน้าขนาดตามรูป */
export async function imagesToPdf(images: Blob[]): Promise<Blob> {
  const [{ jsPDF }, { resizeImage }] = await Promise.all([import('jspdf'), import('./image')])
  let pdf: InstanceType<typeof jsPDF> | null = null
  for (const img of images) {
    const jpg = await resizeImage(img, 2000, 0.85)
    const bmp = await createImageBitmap(jpg)
    const { width, height } = bmp
    bmp.close()
    const data = new Uint8Array(await jpg.arrayBuffer())
    // หน่วย pt · กว้าง 595 (A4) สูงตามสัดส่วนรูป
    const w = 595
    const h = Math.round((height / width) * w)
    const orientation = w > h ? 'landscape' : 'portrait'
    if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [w, h], orientation })
    else pdf.addPage([w, h], orientation)
    pdf.addImage(data, 'JPEG', 0, 0, w, h)
  }
  if (!pdf) throw new Error('ไม่มีหน้าให้รวม')
  return pdf.output('blob')
}
