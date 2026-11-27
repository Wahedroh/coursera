import { expect, test } from '@playwright/test'

test('โบนัสพัฒนาการ: คะแนนดีขึ้นจากครั้งก่อน → ครูเปิดโบนัส → เห็น +โบนัส · นักเรียนเห็นคะแนนรวมโบนัส', async ({ browser }) => {
  const t = await (await browser.newContext()).newPage()
  await t.goto('/teacher/login')
  await t.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await t.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(t.getByRole('heading', { name: /สวัสดีครับครู/ })).toBeVisible()
  const schools = await (await t.request.get('/api/teacher/classes')).json()
  const cls = schools.flatMap((s: { classes: { id: string; name: string }[] }) => s.classes).find((c: { name: string }) => c.name === 'โรงเรียนทดสอบ ชั้น 1')
  const mk = async (title: string, takenOn: string) => (await (await t.request.post('/api/teacher/score-items', { data: { title, category: 'midterm', maxScore: 20, takenOn, classIds: [cls.id] } })).json()).ids[0]
  const a = await mk('กลางภาคทดลอง 1', '2026-11-02')
  const b = await mk('กลางภาคทดลอง 2', '2026-11-16')
  const sheet = await (await t.request.get(`/api/teacher/score-items/${a}`)).json()
  const manee = sheet.students.find((r: { zipgradeId: string }) => r.zipgradeId === '3')
  await t.request.put(`/api/teacher/score-items/${a}/scores/${manee.id}`, { data: { score: 8, absent: false, note: '' } })
  await t.request.put(`/api/teacher/score-items/${b}/scores/${manee.id}`, { data: { score: 14, absent: false, note: '' } })

  await t.goto(`/teacher/score-items/${b}`)
  await t.getByRole('button', { name: /โบนัสพัฒนาการ: ปิด/ }).click()
  await expect(t.getByRole('button', { name: /โบนัสพัฒนาการ: เปิด/ })).toBeVisible()
  // 40% → 70% (+30 จุด) → 7.5% ของ 20 = 1.5 · ช่องกรอกยังเป็นคะแนนจริง 14
  await expect(t.getByTestId('bonus-3')).toContainText('+1.5 🚀')
  await expect(t.getByLabel(/^คะแนน มานี/)).toHaveValue('14')
  await t.getByRole('button', { name: 'เผยแพร่' }).click()

  const s = await (await browser.newContext()).newPage()
  await s.goto('/')
  await s.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill('3')
  await s.getByRole('button', { name: 'ถัดไป' }).click()
  for (const d of '1357') await s.getByRole('button', { name: d, exact: true }).click()
  await expect(s.getByRole('heading', { name: /สวัสดี/ })).toBeVisible()
  await s.goto('/me/scores')
  await expect(s.getByText('รวมโบนัสพัฒนาการ +1.5 🚀')).toBeVisible()
  await expect(s.getByText('15.5')).toBeVisible()
})
