import { expect, test } from '@playwright/test'

// ต่อจาก m1: "ใบงานเศษส่วน" ของมานี (รหัส 3, PIN 1357) ตรวจแล้วและมีรูป
test('ครูดูพื้นที่ไฟล์ แล้วลบรูปงานที่ตรวจแล้ว — นักเรียนยังเห็นคะแนน', async ({ browser }) => {
  const teacher = await (await browser.newContext()).newPage()
  await teacher.goto('/teacher/login')
  await teacher.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await teacher.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await teacher.getByRole('link', { name: 'พื้นที่ไฟล์' }).click()
  await expect(teacher.getByText(/ใช้ไป .* จาก 10.00 GB/)).toBeVisible()
  await expect(teacher.getByText('ใบงานเศษส่วน')).toBeVisible()
  teacher.on('dialog', (d) => d.accept())
  await teacher.getByRole('button', { name: /ลบรูปงาน ใบงานเศษส่วน/ }).click()
  await expect(teacher.getByText(/ลบรูปแล้ว \d+ ไฟล์ จากงาน 1 ชิ้น/)).toBeVisible()
  await expect(teacher.getByText('ไม่มีงานที่ตรวจแล้วและยังมีรูปค้างอยู่')).toBeVisible()

  const student = await (await browser.newContext()).newPage()
  await student.goto('/')
  await student.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill('3')
  await student.getByRole('button', { name: 'ถัดไป' }).click()
  for (const d of '1357') await student.getByRole('button', { name: d, exact: true }).click()
  await student.getByRole('tab', { name: /ตรวจแล้ว/ }).click()
  await student.getByRole('link', { name: /ใบงานเศษส่วน/ }).click()
  await expect(student.getByText('ครูลบรูปงานนี้แล้วเพื่อประหยัดพื้นที่ (คะแนนยังอยู่)')).toBeVisible()
  await expect(student.getByText('ครูตรวจแล้ว')).toBeVisible()
})
