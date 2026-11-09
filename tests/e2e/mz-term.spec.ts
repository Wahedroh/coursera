import { expect, test } from '@playwright/test'

// รันท้ายสุดจริง ๆ (หลัง m99): ขึ้นเทอมใหม่แล้ว EXP/งาน/คะแนนของทุกเทสต์จะเริ่มใหม่
test('ครูขึ้นเทอมใหม่ → นักเรียนเริ่ม LV 0 และสะสมซีซัน 2', async ({ browser }) => {
  const t = await (await browser.newContext()).newPage()
  await t.goto('/teacher/login')
  await t.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await t.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  const card = t.getByTestId('term-card')
  await card.getByRole('button', { name: 'ขึ้นเทอมใหม่' }).click()
  await expect(card.getByLabel('ชื่อเทอมใหม่')).toHaveValue('1/2570')
  t.once('dialog', (d) => {
    expect(d.message()).toContain('EXP/เลเวลของนักเรียนทุกคนเริ่มนับ 0 ใหม่')
    void d.accept()
  })
  await card.getByRole('button', { name: 'เปิดเทอม 1/2570' }).click()
  await expect(card.getByRole('heading', { name: '🗓️ เทอม 1/2570' })).toBeVisible()
  await expect(card.getByText(/ไข่ของเทอมนี้ได้ตัวละครซีซัน 2/)).toBeVisible()

  const s = await (await browser.newContext()).newPage()
  await s.goto('/')
  await s.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill('3')
  await s.getByRole('button', { name: 'ถัดไป' }).click()
  for (const d of '1357') await s.getByRole('button', { name: d, exact: true }).click()
  await expect(s.getByRole('link', { name: /เลเวล 0 · 0 EXP/ })).toBeVisible()
  await s.getByRole('link', { name: '⭐ ตัวละครและแต้มของฉัน' }).click()
  await expect(s.getByText('เทอม 1/2570')).toBeVisible()
  await expect(s.getByTestId('collection-s2').getByRole('heading')).toContainText('เทอมนี้')
  await expect(s.getByText('LV 0')).toBeVisible()
})
