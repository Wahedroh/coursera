import { expect, test, type Browser, type Page } from '@playwright/test'
import path from 'node:path'

const FIXTURE = path.resolve('tests/fixtures/roster.sample.csv')

async function teacherPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto('/teacher/login')
  await page.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(page.getByRole('heading', { name: /สวัสดี/ })).toBeVisible()
  return page
}

async function importFixture(page: Page) {
  await page.getByRole('link', { name: 'นำเข้ารายชื่อ' }).first().click()
  await page.getByLabel('เลือกไฟล์ CSV จาก ZipGrade').setInputFiles(FIXTURE)
  await expect(page.getByTestId('stat-new')).toContainText('7')
  await expect(page.getByTestId('stat-flagged')).toContainText('4')
  await page.getByRole('button', { name: /ยืนยันนำเข้า/ }).click()
  await expect(page.getByText(/นำเข้าสำเร็จ/)).toBeVisible()
}

async function typePin(page: Page, pin: string) {
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click()
}

test('ครูนำเข้ารายชื่อ แล้วนักเรียนตั้ง PIN และเข้าสู่ระบบ', async ({ browser }) => {
  const teacher = await teacherPage(browser)
  await importFixture(teacher)
  await teacher.goto('/teacher')
  await expect(teacher.getByText('โรงเรียนทดสอบ', { exact: true })).toBeVisible()

  const student = await (await browser.newContext()).newPage()
  await student.goto('/')
  await student.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill('1')
  await student.getByRole('button', { name: 'ถัดไป' }).click()
  await expect(student.getByText('เด็กหญิงสมใจ ใจดี')).toBeVisible()
  await student.getByRole('button', { name: 'ใช่ ตั้ง PIN' }).click()
  await typePin(student, '2468')
  await typePin(student, '2468')
  await expect(student.getByText('สวัสดี สมใจ')).toBeVisible()

  await student.getByRole('button', { name: 'ออกจากระบบ' }).click()
  await student.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill('1')
  await student.getByRole('button', { name: 'ถัดไป' }).click()
  await typePin(student, '2468')
  await expect(student.getByText('สวัสดี สมใจ')).toBeVisible()
})

test('ครูรีเซ็ต PIN แล้วนักเรียนต้องตั้งใหม่', async ({ browser }) => {
  const teacher = await teacherPage(browser)
  await teacher.getByRole('link', { name: /โรงเรียนทดสอบ ชั้น 1/ }).click()
  const row = teacher.getByRole('row', { name: /สมใจ/ })
  await expect(row.getByText('ตั้งแล้ว')).toBeVisible()
  teacher.once('dialog', (d) => d.accept())
  await row.getByRole('button', { name: 'รีเซ็ต PIN' }).click()
  await expect(row.getByText('ยังไม่ตั้ง')).toBeVisible()

  const student = await (await browser.newContext()).newPage()
  await student.goto('/')
  await student.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill('1')
  await student.getByRole('button', { name: 'ถัดไป' }).click()
  await expect(student.getByRole('button', { name: 'ใช่ ตั้ง PIN' })).toBeVisible()
})
