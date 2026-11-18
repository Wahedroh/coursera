import { expect, test } from '@playwright/test'

// รันท้ายสุดจริง ๆ (หลัง m99): ขึ้นเทอมใหม่แล้ว EXP/งาน/คะแนนของทุกเทสต์จะเริ่มใหม่
test('เทอม 2/2569 → ขึ้นปีใหม่ใช้ขั้นตอนแยก · เทอม 1/2570 → ปุ่มขึ้นเทอม 2/2570 (ซีซัน 2 · คัดลอกตาราง) → นักเรียนเริ่ม LV 0', async ({ browser }) => {
  const t = await (await browser.newContext()).newPage()
  await t.goto('/teacher/login')
  await t.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await t.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  const card = t.getByTestId('term-card')
  // เทอม 2/2569: เทอมถัดไปเป็นปีการศึกษาใหม่ → ไม่มีปุ่มขึ้นเทอมธรรมดา
  await expect(card.getByTestId('next-year-note')).toContainText('1/2570')
  await expect(card.getByRole('button', { name: /^ขึ้นเทอม/ })).toHaveCount(0)

  // (จำลองขั้นตอนขึ้นปีใหม่) เปิดเทอม 1/2570 ผ่าน API → เทอม 1 = ซีซัน 1
  expect(await (await t.request.post('/api/teacher/terms', { data: { semester: 1, year: 2570 } })).json()).toMatchObject({ name: '1/2570', season: 1 })
  await t.reload()
  await card.getByRole('button', { name: 'ขึ้นเทอม 2/2570' }).click()
  await card.getByRole('checkbox').check()
  t.once('dialog', (d) => {
    expect(d.message()).toContain('EXP/เลเวลของนักเรียนทุกคนเริ่มนับ 0 ใหม่')
    void d.accept()
  })
  await card.getByRole('button', { name: 'เปิดเทอม 2/2570' }).click()
  await expect(card.getByRole('heading', { name: 'เทอม 2/2570' })).toBeVisible()
  await expect(card.getByText(/ไข่ของเทอมนี้ได้ตัวละครซีซัน 2/)).toBeVisible()

  const s = await (await browser.newContext()).newPage()
  await s.goto('/')
  await s.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill('3')
  await s.getByRole('button', { name: 'ถัดไป' }).click()
  for (const d of '1357') await s.getByRole('button', { name: d, exact: true }).click()
  await expect(s.getByRole('link', { name: /เลเวล 0 · 0 EXP/ })).toBeVisible()
  await s.getByRole('link', { name: '⭐ ตัวละครและแต้มของฉัน' }).click()
  await expect(s.getByText('เทอม 2/2570')).toBeVisible()
  await expect(s.getByTestId('collection-s2').getByRole('heading')).toContainText('เทอมนี้')
  await expect(s.getByText('LV 0')).toBeVisible()
})
