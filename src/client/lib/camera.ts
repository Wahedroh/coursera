/** กล้องสำหรับคุมสอบ: เปิดทีละกล้อง (มือถือส่วนใหญ่เปิดหน้า-หลังพร้อมกันไม่ได้) · ถ่ายภาพนิ่งขนาดเล็ก */
export type Facing = 'user' | 'environment'

export async function openCamera(facing: Facing): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('เครื่อง/เบราว์เซอร์นี้เปิดกล้องผ่านเว็บไม่ได้ — ลองเปิดด้วย Safari หรือ Chrome หรือขอครูเปลี่ยนเป็นสอบออนไซต์')
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
  } catch (e) {
    const name = (e as DOMException)?.name
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new Error('ยังไม่ได้อนุญาตให้ใช้กล้อง — กดอนุญาตกล้อง (ถ้าเคยกดไม่อนุญาต ให้เปิดในตั้งค่าเบราว์เซอร์) แล้วลองใหม่')
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new Error('ไม่พบกล้องในเครื่องนี้ — ขอครูเปลี่ยนเป็นสอบออนไซต์')
    throw new Error('เปิดกล้องไม่ได้ — ปิดแอปอื่นที่ใช้กล้องอยู่แล้วลองใหม่')
  }
}

export function stopCamera(s: MediaStream | null | undefined) {
  s?.getTracks().forEach((t) => t.stop())
}

/** ภาพนิ่งจากวิดีโอ (JPEG กว้าง ~480px ≈ 20–40 KB) */
export function snapshot(video: HTMLVideoElement, width = 480, quality = 0.6): Promise<Blob | null> {
  if (!video.videoWidth || !video.videoHeight) return Promise.resolve(null)
  const scale = Math.min(1, width / video.videoWidth)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality))
}
