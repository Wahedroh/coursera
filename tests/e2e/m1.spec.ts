import { expect, test, type Browser, type Page } from '@playwright/test'
import path from 'node:path'

const FIXTURE = path.resolve('tests/fixtures/roster.sample.csv')
/** สร้าง JPEG จริงด้วย canvas ของเบราว์เซอร์ (ไม่มีข้อมูลจริง) */
async function makeJpeg(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 400
    c.height = 300
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 400, 300)
    ctx.fillStyle = '#2b3a8f'
    ctx.font = '28px sans-serif'
    ctx.fillText('1/2 + 1/4 = 2/6', 40, 150)
    return c.toDataURL('image/jpeg', 0.9)
  })
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

async function teacherPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto('/teacher/login')
  await page.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page.getByRole('heading', { name: /สวัสดี/ })).toBeVisible()
  return page
}

async function typePin(page: Page, pin: string) {
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click()
}

test('ครูสร้างงาน → นักเรียนส่ง → ครูตรวจและเขียนทับ → นักเรียนเห็นคะแนน', async ({ browser }) => {
  const teacher = await teacherPage(browser)
  // ให้แน่ใจว่ามีรายชื่อ (นำเข้าซ้ำได้)
  await teacher.goto('/teacher/import')
  await teacher.getByLabel('เลือกไฟล์ CSV จาก ZipGrade').setInputFiles(FIXTURE)
  await teacher.getByRole('button', { name: /ยืนยันนำเข้า/ }).click()
  await expect(teacher.getByText(/นำเข้าสำเร็จ/)).toBeVisible()

  // สร้างงาน
  await teacher.goto('/teacher/assignments/new')
  await teacher.getByLabel('โรงเรียนทดสอบ ชั้น 1').check()
  await teacher.getByLabel('ชื่องาน').fill('ใบงานเศษส่วน')
  await teacher.getByLabel('คำสั่ง').fill('ทำข้อ 1-10 ถ่ายรูปส่ง')
  await teacher.getByLabel('คะแนนเต็ม').fill('10')
  await teacher.getByRole('button', { name: 'สร้างงาน' }).click()
  await expect(teacher.getByText(/สร้างงานแล้ว/)).toBeVisible()

  // นักเรียนส่งงาน
  const student = await (await browser.newContext()).newPage()
  await student.goto('/')
  await student.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill('3')
  await student.getByRole('button', { name: 'ถัดไป' }).click()
  await student.getByRole('button', { name: 'ใช่ ตั้ง PIN' }).click()
  await typePin(student, '1357')
  await typePin(student, '1357')
  await expect(student.getByText('ค้างส่ง 1 งาน')).toBeVisible()
  await student.getByRole('link', { name: /ใบงานเศษส่วน/ }).click()
  await student.getByLabel('ข้อความ').fill('ข้อ 7 ไม่แน่ใจค่ะ')
  await student.getByLabel('เพิ่มรูปงาน').setInputFiles({ name: 'work.jpg', mimeType: 'image/jpeg', buffer: await makeJpeg(student) })
  await expect(student.getByRole('img', { name: 'รูปงาน 1' })).toBeVisible()
  await expect(student.getByText('กำลังอัปโหลด…')).toHaveCount(0)
  await expect(student.getByText(/อัปโหลดไม่สำเร็จ|รองรับเฉพาะรูป/)).toHaveCount(0)
  await student.getByRole('button', { name: /^ส่งงาน/ }).click()
  await expect(student.getByText('ส่งแล้ว รอครูตรวจ')).toBeVisible()

  // ครูดูตารางและตรวจ
  await teacher.goto('/teacher')
  await teacher.getByRole('link', { name: /โรงเรียนทดสอบ ชั้น 1/ }).click()
  await teacher.getByRole('link', { name: 'ตารางทวงงาน' }).click()
  await teacher.getByRole('link', { name: 'มานี มีนา · ใบงานเศษส่วน' }).click()
  await expect(teacher.getByText('ข้อ 7 ไม่แน่ใจค่ะ')).toBeVisible()
  const canvas = teacher.getByTestId('annotate-canvas').first()
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  await teacher.mouse.move(box.x + 10, box.y + 10)
  await teacher.mouse.down()
  await teacher.mouse.move(box.x + box.width - 10, box.y + box.height - 10, { steps: 5 })
  await teacher.mouse.up()
  await teacher.getByLabel('คะแนน', { exact: true }).fill('8')
  await teacher.getByLabel('คอมเมนต์').fill('ทำส่วนให้เท่ากันก่อนนะ')
  await teacher.getByRole('button', { name: 'บันทึก & ถัดไป' }).click()
  await expect(teacher.getByText(/บันทึกคะแนนแล้ว/)).toBeVisible()

  // นักเรียนเห็นผล
  await student.reload()
  await expect(student.getByText('8/10')).toBeVisible()
  await expect(student.getByText('ทำส่วนให้เท่ากันก่อนนะ')).toBeVisible()
  await expect(student.getByRole('img', { name: 'รูปที่ครูตรวจ 1' })).toBeVisible()
})

test('อัปโหลดรูปไม่สำเร็จ → แจ้งเตือนและส่งงานไม่ได้จนกว่าจะลบรูปนั้น', async ({ browser }) => {
  const student = await (await browser.newContext()).newPage()
  await student.goto('/')
  await student.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill('2')
  await student.getByRole('button', { name: 'ถัดไป' }).click()
  await student.getByRole('button', { name: 'ใช่ ตั้ง PIN' }).click()
  await typePin(student, '2468')
  await typePin(student, '2468')
  await student.getByRole('link', { name: /ใบงานเศษส่วน/ }).click()
  await student.route('**/api/files?**', (r) => r.abort())
  await student.getByLabel('เพิ่มรูปงาน').setInputFiles({ name: 'work.jpg', mimeType: 'image/jpeg', buffer: await makeJpeg(student) })
  await expect(student.getByText('อัปโหลดไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')).toBeVisible()
  await expect(student.getByRole('button', { name: 'ลบรูปที่อัปโหลดไม่สำเร็จก่อนส่ง' })).toBeDisabled()
  await student.getByRole('button', { name: 'ลบรูปงาน 1' }).click()
  await student.getByLabel('ข้อความ').fill('ส่งเป็นข้อความแทน')
  await expect(student.getByRole('button', { name: /^ส่งงาน/ })).toBeEnabled()
})
