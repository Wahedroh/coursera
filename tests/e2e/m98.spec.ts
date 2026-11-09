import { expect, test, type Browser } from '@playwright/test'

// ห้อง "โรงเรียนทดสอบ ชั้น 1": มานี (3, PIN 1357)
async function teacherHome(browser: Browser) {
  const t = await (await browser.newContext()).newPage()
  await t.goto('/teacher/login')
  await t.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await t.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(t.getByRole('heading', { name: /สวัสดีครับครู/ })).toBeVisible()
  return t
}
async function studentPage(browser: Browser) {
  const s = await (await browser.newContext()).newPage()
  await s.goto('/')
  await s.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill('3')
  await s.getByRole('button', { name: 'ถัดไป' }).click()
  for (const d of '1357') await s.getByRole('button', { name: d, exact: true }).click()
  await expect(s.getByRole('heading', { name: /สวัสดี/ })).toBeVisible()
  return s
}

test('หน้าแรกครู: สรุปวันนี้ (รอตรวจ/ขาด/ใกล้ครบกำหนด) และการ์ดเทอม', async ({ browser }) => {
  const t = await teacherHome(browser)
  const today = t.getByTestId('teacher-today')
  await expect(today.getByRole('heading', { name: '📋 สรุปวันนี้' })).toBeVisible()
  for (const name of ['งานรอตรวจ', 'ขาดเรียนวันนี้', 'ใกล้ครบกำหนด']) await expect(today.getByRole('region', { name })).toBeVisible()
  await expect(t.getByTestId('term-card').getByRole('heading', { name: '🗓️ เทอม 2/2569' })).toBeVisible()
  await expect(t.getByTestId('term-card').getByText(/คอลเลกชันซีซัน 1/)).toBeVisible()
})

test('ครูเพิ่มคำถามท้ายคลิป · นักเรียนเห็นว่าต้องตอบคำถามจึงได้ EXP', async ({ browser }) => {
  const t = await teacherHome(browser)
  await t.getByRole('link', { name: /โรงเรียนทดสอบ ชั้น 1/ }).click()
  await t.getByRole('link', { name: 'คลิปย้อนหลัง' }).first().click()
  await t.getByLabel('ลิงก์ YouTube').fill('https://youtu.be/dQw4w9WgXcQ')
  await t.getByLabel('ชื่อคลิป').fill('คลิปมีคำถาม')
  await t.getByRole('button', { name: '+ เพิ่มคำถาม' }).click()
  await t.getByLabel('คำถามข้อ 1', { exact: true }).fill('1+1 เท่ากับเท่าไร')
  await t.getByLabel('ข้อ 1 ตัวเลือก ก', { exact: true }).fill('1')
  await t.getByLabel('ข้อ 1 ตัวเลือก ข', { exact: true }).fill('2')
  await t.getByLabel('ข้อ 1 คำตอบที่ถูกคือ ข').check()
  await t.getByRole('button', { name: 'เพิ่มคลิป', exact: true }).click()
  await expect(t.getByText('คำถามท้ายคลิป 1 ข้อ')).toBeVisible()

  const s = await studentPage(browser)
  await s.goto('/me/videos')
  await s.getByText('คลิปมีคำถาม').click()
  await expect(s.getByTestId('watch-reward')).toContainText('ดูถึง 70% + ตอบ 1 ข้อ รับ +5 EXP')
})

test('นักเรียน: ภารกิจสัปดาห์นี้บนหน้าแรก · คอลเลกชันแยกซีซัน', async ({ browser }) => {
  const s = await studentPage(browser)
  const q = s.getByTestId('weekly-quests')
  await expect(q.getByRole('heading', { name: '🎯 ภารกิจสัปดาห์นี้' })).toBeVisible()
  for (const name of ['มาเรียน 3 คาบ', 'ส่งงานตรงเวลา 1 ชิ้น', 'ทบทวนคลิป 1 คลิป']) await expect(q.getByText(name)).toBeVisible()
  await s.getByRole('link', { name: '⭐ ตัวละครและแต้มของฉัน' }).click()
  await expect(s.getByText('เทอม 2/2569')).toBeVisible()
  await expect(s.getByTestId('collection-s1').getByRole('heading', { name: /ซีซัน 1 · สัตว์วิเศษ/ })).toContainText('เทอมนี้')
  await expect(s.getByTestId('collection-s2').getByRole('heading', { name: /ซีซัน 2 · เพื่อนป่าหิมะ \(0\/16\)/ })).toContainText('เริ่มสะสมได้เทอมหน้า')
})
