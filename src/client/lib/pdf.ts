/** สร้าง PDF จากหน้ารายงานโดยตรง (ไม่พึ่งหน้าต่างพิมพ์ ซึ่งมือถือ/แอป LINE หลายรุ่นเปิดไม่ได้)
 *  วาดแต่ละหน้าที่ความกว้าง A4 คงที่ (ไม่ขึ้นกับจอ) แล้วใส่ลง PDF หน้าละ 1 รูป */
export async function downloadPagesPdf(pages: HTMLElement[], fileName: string, onProgress?: (done: number, total: number) => void): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
  await document.fonts.ready
  const stage = document.createElement('div')
  stage.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff'
  document.body.appendChild(stage)
  try {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
    const margin = 12
    const maxW = 210 - margin * 2
    const maxH = 297 - margin * 2
    for (const [i, el] of pages.entries()) {
      const clone = el.cloneNode(true) as HTMLElement
      clone.style.cssText = 'width:794px;border:0;border-radius:0;margin:0;padding:24px;box-sizing:border-box;background:#fff'
      stage.replaceChildren(clone)
      const canvas = await html2canvas(clone, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
      let w = maxW
      let h = (canvas.height / canvas.width) * w
      if (h > maxH) {
        w = (w * maxH) / h
        h = maxH
      }
      if (i > 0) pdf.addPage()
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', margin + (maxW - w) / 2, margin, w, h)
      onProgress?.(i + 1, pages.length)
    }
    // ใช้ลิงก์ดาวน์โหลดเอง เพื่อให้ได้ชื่อไฟล์ภาษาไทยตามที่ตั้ง
    const url = URL.createObjectURL(pdf.output('blob'))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } finally {
    stage.remove()
  }
}

/** เบราว์เซอร์ในแอป (LINE, Facebook, Messenger, Instagram) มักดาวน์โหลดไฟล์/พิมพ์ไม่ได้ */
export const inAppBrowser = (ua = navigator.userAgent) => /\bLine\/|FBAN|FBAV|FB_IAB|Messenger|Instagram/i.test(ua)

/** ลิงก์ให้ LINE เปิดหน้านี้ในเบราว์เซอร์ปกติ (LINE รองรับพารามิเตอร์ openExternalBrowser) */
export function externalBrowserUrl(href = location.href) {
  const u = new URL(href)
  u.searchParams.set('openExternalBrowser', '1')
  return u.toString()
}
