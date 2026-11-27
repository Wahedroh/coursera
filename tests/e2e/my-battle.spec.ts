import { teacherNav } from './nav'
import { expect, test } from '@playwright/test'

test('ศึกสอบ: ข้อสอบชุดเดียวกัน 2 โรงเรียน → ครูเห็นอันดับ · นักเรียนเห็นห้องตัวเองในหน้าคะแนน · ครูปิดรายห้องได้', async ({ browser }) => {
  const t = await (await browser.newContext()).newPage()
  await t.goto('/teacher/login')
  await t.getByLabel('รหัสผ่านครู').fill('teacher-pass')
  await t.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await expect(t.getByRole('heading', { name: /สวัสดีครับครู/ })).toBeVisible()
  const schools = await (await t.request.get('/api/teacher/classes')).json()
  const all = schools.flatMap((s: { classes: { id: string; name: string }[] }) => s.classes)
  const c1 = all.find((c: { name: string }) => c.name === 'โรงเรียนทดสอบ ชั้น 1')
  const c5 = all.find((c: { name: string }) => c.name === 'โรงเรียนตัวอย่าง ชั้น 5')
  const { ids } = await (await t.request.post('/api/teacher/score-items', { data: { title: 'ศึกสอบบทที่ 4', category: 'quiz', maxScore: 10, takenOn: '2026-11-20', classIds: [c1.id, c5.id] } })).json()
  for (const [i, id] of ids.entries()) {
    const sheet = await (await t.request.get(`/api/teacher/score-items/${id}`)).json()
    for (const [k, st] of sheet.students.entries()) await t.request.put(`/api/teacher/score-items/${id}/scores/${st.id}`, { data: { score: i === 0 ? 9 - k : 5 + (k % 2), absent: false, note: '' } })
    await t.request.put(`/api/teacher/score-items/${id}/published`, { data: { published: true } })
  }

  await teacherNav(t, 'ศึกสอบ')
  await expect(t.getByRole('heading', { name: '⚔️ ศึกสอบ' })).toBeVisible()
  const card = t.getByTestId('battle-card').filter({ hasText: 'ศึกสอบบทที่ 4' })
  await expect(card).toContainText('โรงเรียนทดสอบ ชั้น 1')
  await expect(card).toContainText('โรงเรียนตัวอย่าง ชั้น 5')
  await expect(card).toContainText('🥇')

  const s = await (await browser.newContext()).newPage()
  await s.goto('/')
  await s.getByLabel('รหัสนักเรียน (ZipGrade ID)').fill('3')
  await s.getByRole('button', { name: 'ถัดไป' }).click()
  for (const d of '1357') await s.getByRole('button', { name: d, exact: true }).click()
  await expect(s.getByRole('heading', { name: /สวัสดี/ })).toBeVisible()
  await s.goto('/me/scores')
  const mine = s.getByTestId('battle-card').filter({ hasText: 'ศึกสอบบทที่ 4' })
  await expect(mine).toContainText('ห้องเราได้อันดับ 1 จาก 2 ห้อง')
  // อันดับรายคน (ทุกโรงเรียน): ชื่อเล่น + โรงเรียน · ไม่แสดงชื่อจริง
  await mine.getByRole('tab', { name: '🏅 อันดับรายคน' }).click()
  const people = mine.getByTestId('battle-people')
  await expect(people).toContainText('โรงเรียนทดสอบ')
  await expect(people).toContainText('โรงเรียนตัวอย่าง')
  await expect(people).not.toContainText('มานี')
  await expect(people).not.toContainText('สมใจ')

  // ครูปิดศึกสอบของห้องชั้น 5 → ไม่มีคู่แข่ง ศึกนี้หายไป
  await t.getByLabel('เข้าร่วมศึกสอบ โรงเรียนตัวอย่าง ชั้น 5').uncheck()
  await expect(t.getByTestId('battle-card').filter({ hasText: 'ศึกสอบบทที่ 4' })).toHaveCount(0)
  await t.getByLabel('เข้าร่วมศึกสอบ โรงเรียนตัวอย่าง ชั้น 5').check()
})
