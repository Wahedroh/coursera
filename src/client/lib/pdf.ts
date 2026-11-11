/** แปลงหน้า A4 ในหน้าเว็บเป็นไฟล์ PDF ในเครื่องผู้ใช้ (ไม่ส่งข้อมูลขึ้นเซิร์ฟเวอร์) */
export async function downloadA4Pdf(el: HTMLElement, fileName: string): Promise<void> {
  const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')])
  await document.fonts.ready
  const png = await toPng(el, { pixelRatio: 2.5, backgroundColor: '#ffffff', style: { margin: '0', boxShadow: 'none', transform: 'none' } })
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  pdf.addImage(png, 'PNG', 0, 0, 210, 297)
  pdf.save(fileName)
}
