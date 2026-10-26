import { expect, test, type Browser, type Page } from '@playwright/test'

async function teacherPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto('/teacher/login')
  await page.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page.getByRole('heading', { name: /สวัสดี/ })).toBeVisible()
  return page
}

async function studentPage(browser: Browser, id: string, pin: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto('/')
  await page.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill(id)
  await page.getByRole('button', { name: 'ถัดไป' }).click()
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click()
  await expect(page.getByText(/สวัสดี/)).toBeVisible()
  return page
}

// ต่อจาก m3: ห้อง "โรงเรียนทดสอบ ชั้น 1" มี สมใจ, สมชาย, มานี (รหัส 3, PIN 1357)
test('คลิปย้อนหลัง: ครูวางลิงก์ YouTube → นักเรียนดูในเว็บ ไม่มีลิงก์ออกไป YouTube', async ({ browser }) => {
  const teacher = await teacherPage(browser)
  await teacher.getByRole('link', { name: /โรงเรียนทดสอบ ชั้น 1/ }).click()
  await teacher.getByRole('link', { name: 'คลิปย้อนหลัง' }).click()
  await teacher.getByLabel('ลิงก์ YouTube').fill('https://vimeo.com/123')
  await expect(teacher.getByText('ไม่ใช่ลิงก์คลิป YouTube')).toBeVisible()
  await teacher.getByLabel('ลิงก์ YouTube').fill('https://youtu.be/dQw4w9WgXcQ?si=share')
  await teacher.getByLabel('ชื่อคลิป').fill('ทบทวนบทที่ 3')
  await teacher.getByRole('button', { name: 'เพิ่มคลิป' }).click()
  await expect(teacher.getByText('เพิ่มคลิปแล้ว 1 ห้อง')).toBeVisible()
  await expect(teacher.getByText('นักเรียนเห็น')).toBeVisible()

  const student = await studentPage(browser, '3', '1357')
  await student.getByRole('link', { name: /คลิปย้อนหลัง/ }).click()
  await student.getByRole('link', { name: /ทบทวนบทที่ 3/ }).click()
  await expect(student.getByTestId('video-title')).toHaveText('ทบทวนบทที่ 3')
  await expect(student.getByTestId('protected-player')).toBeVisible()
  // ไม่มีลิงก์ใด ๆ ที่พาออกไป YouTube
  await expect(student.locator('a[href*="youtube"], a[href*="youtu.be"]')).toHaveCount(0)
  // คลิกขวาบนคลิปถูกปิด
  const prevented = await student.getByTestId('protected-player').evaluate((el) => {
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    el.dispatchEvent(e)
    return e.defaultPrevented
  })
  expect(prevented).toBe(true)

  // ครูซ่อนคลิป → นักเรียนไม่เห็น
  await teacher.getByRole('button', { name: 'ซ่อน', exact: true }).click()
  await expect(teacher.getByText('ซ่อนอยู่')).toBeVisible()
  await student.goto('/me/videos')
  await expect(student.getByText('ยังไม่มีคลิป')).toBeVisible()
})

test('ค่าเอกสาร: ครูเลือกบางคน → จ่ายบางส่วน → นักเรียนเห็นยอดค้างของตัวเอง', async ({ browser }) => {
  const teacher = await teacherPage(browser)
  await teacher.getByRole('link', { name: /โรงเรียนทดสอบ ชั้น 1/ }).click()
  await teacher.getByRole('link', { name: 'ค่าเอกสาร' }).click()
  await teacher.getByLabel('ชื่อรายการ').fill('ชีทบทที่ 1-3')
  await teacher.getByLabel('ราคา (บาท)').fill('45')
  await teacher.getByRole('button', { name: 'สร้างรายการ' }).click()
  await expect(teacher.getByRole('heading', { name: 'ชีทบทที่ 1-3' })).toBeVisible()

  await teacher.getByLabel('ต้องจ่าย มานี มีนา').check()
  await expect(teacher.getByTestId('fee-status-3')).toContainText('ค้าง ฿45')
  await teacher.getByLabel('จ่ายแล้ว มานี มีนา').fill('20')
  await teacher.getByLabel('จ่ายแล้ว มานี มีนา').press('Enter')
  await expect(teacher.getByTestId('fee-status-3')).toContainText('ค้าง ฿25')
  await expect(teacher.getByTestId('fee-summary')).toContainText('1 คน')
  // จ่ายเกินยอด → กรอบแดง ไม่บันทึก
  await teacher.getByLabel('จ่ายแล้ว มานี มีนา').fill('99')
  await teacher.getByLabel('จ่ายแล้ว มานี มีนา').press('Enter')
  await expect(teacher.getByText('จ่ายแล้วต้องไม่เกินยอด')).toBeVisible()
  await teacher.getByLabel('จ่ายแล้ว มานี มีนา').fill('20')
  await teacher.getByLabel('จ่ายแล้ว มานี มีนา').press('Enter')

  const student = await studentPage(browser, '3', '1357')
  await expect(student.getByText('ค้างค่าเอกสาร ฿25')).toBeVisible()
  await student.getByRole('link', { name: /ค้างค่าเอกสาร/ }).click()
  await expect(student.getByTestId('fee-total')).toHaveText('ค้างจ่ายรวม ฿25')
  await expect(student.getByText('ชีทบทที่ 1-3')).toBeVisible()

  await teacher.getByRole('button', { name: 'จ่ายครบ' }).click()
  await expect(teacher.getByTestId('fee-status-3')).toContainText('จ่ายครบ')
  await student.reload()
  await expect(student.getByTestId('fee-total')).toHaveText('ไม่มียอดค้าง 🎉')
})
