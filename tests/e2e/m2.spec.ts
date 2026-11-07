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

// ต่อจาก m1: นักเรียนรหัส 3 (มานี) ตั้ง PIN 1357 ไว้แล้ว
test('เช็กชื่อ + QR เช็กอิน + แจกแต้ม + เปิดไข่', async ({ browser }) => {
  const teacher = await teacherPage(browser)
  await teacher.getByRole('link', { name: /โรงเรียนทดสอบ ชั้น 1/ }).click()
  await teacher.getByRole('link', { name: 'เช็กชื่อ' }).click()
  await teacher.getByRole('button', { name: 'เริ่มเช็กชื่อวันนี้' }).click()
  const absent = teacher.getByRole('button', { name: 'มานี มีนา ขาด' })
  await absent.click()
  await expect(absent).toHaveAttribute('aria-pressed', 'true')

  await teacher.getByRole('link', { name: /เปิด QR/ }).click()
  const url = await teacher.getByTestId('checkin-url').getAttribute('href')
  expect(url).toMatch(/^\/checkin\?d=.+&t=[0-9a-f]{16}$/)

  const student = await studentPage(browser, '3', '1357')
  await student.goto(url!)
  await expect(student.getByText('เช็กชื่อแล้ว ✓')).toBeVisible()
  await expect(teacher.getByTestId('checked-in')).toContainText('มานี', { timeout: 10_000 })

  await teacher.goBack()
  await expect(teacher.getByRole('button', { name: 'มานี มีนา มา' })).toHaveAttribute('aria-pressed', 'true')

  // แจกแต้มจากผังห้อง
  await teacher.getByRole('link', { name: /← โรงเรียนทดสอบ ชั้น 1/ }).click()
  await teacher.getByRole('link', { name: 'ผังห้อง & แต้ม' }).click()
  await teacher.getByRole('button', { name: 'มานี มีนา', exact: true }).click()
  await teacher.getByRole('button', { name: 'ตอบคำถาม' }).click()
  await teacher.getByRole('button', { name: '+5' }).click()
  await expect(teacher.getByText('ให้ +5 แต้ม: มานี')).toBeVisible()
  // ครบเลเวล 1 พอดี: ส่งงาน M1 +30 · มาเรียน +5 · แจก +5 = 40 EXP

  await student.goto('/me/progress')
  await expect(student.getByText('LV 1', { exact: true })).toBeVisible()
  await expect(student.getByText('ตอบคำถาม').first()).toBeVisible()
  await student.getByRole('button', { name: /เปิดไข่/ }).click()
  await expect(student.getByText(/ได้ตัวละคร/)).toBeVisible()
  await expect(student.getByText('คอลเลกชัน (1/16)')).toBeVisible()
})
