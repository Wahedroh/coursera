import { expect, test } from '@playwright/test'

// ต่อจาก m3/m1: ห้อง "โรงเรียนทดสอบ ชั้น 1" มีคะแนนสอบและงานที่ตรวจแล้ว · มานี (รหัส 3, PIN 1357)
test('ครูดูเกรดอิงกลุ่ม ปรับเกณฑ์ แล้วเปิดให้นักเรียนเห็นเกรดตัวเอง', async ({ browser }) => {
  const teacher = await (await browser.newContext()).newPage()
  await teacher.goto('/teacher/login')
  await teacher.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await teacher.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await teacher.getByRole('link', { name: /โรงเรียนทดสอบ ชั้น 1/ }).click()
  await teacher.getByRole('link', { name: 'เกรด', exact: true }).click()
  await expect(teacher.getByRole('heading', { name: 'เกรด (อิงกลุ่ม)' })).toBeVisible()
  await expect(teacher.getByTestId('grade-3')).not.toHaveText('')
  await expect(teacher.getByTestId('grade-dist')).toContainText('เกรด 4')

  // เปลี่ยนเป็น 5 ระดับแล้วบันทึก
  await teacher.getByRole('button', { name: 'ใช้ 5 ระดับ' }).click()
  await teacher.getByRole('button', { name: 'บันทึกเกณฑ์' }).click()
  await expect(teacher.getByText('บันทึกเกณฑ์แล้ว')).toBeVisible()
  await expect(teacher.getByTestId('grade-dist')).not.toContainText('3.5')

  const student = await (await browser.newContext()).newPage()
  await student.goto('/')
  await student.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill('3')
  await student.getByRole('button', { name: 'ถัดไป' }).click()
  for (const d of '1357') await student.getByRole('button', { name: d, exact: true }).click()
  await student.getByRole('link', { name: /คะแนนสอบ/ }).click()
  await expect(student.getByRole('heading', { name: 'คะแนนสอบ' })).toBeVisible()
  await expect(student.getByTestId('my-grade')).toHaveCount(0)

  await teacher.getByLabel('ให้นักเรียนเห็นเกรดของตัวเอง').check()
  await expect(teacher.getByText('นักเรียนเห็นเกรดคาดการณ์ของตัวเองแล้ว')).toBeVisible()
  const expected = (await teacher.getByTestId('grade-3').textContent())?.trim()
  await student.reload()
  await expect(student.getByTestId('my-grade')).toHaveText(expected!)
})
