import { env, SELF } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { json, loginTeacher, postJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

const connect = (id: string, cookie?: string) =>
  SELF.fetch(`http://x/api/live/${id}/ws`, { headers: { Upgrade: 'websocket', ...(cookie ? { cookie } : {}) } })

/** รอข้อความ state ถัดไปที่ตรงเงื่อนไข */
function nextState(ws: WebSocket, pred: (s: any) => boolean = () => true): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), 5000)
    ws.addEventListener('message', function on(e) {
      const m = JSON.parse(String(e.data))
      if (m.type === 'state' && pred(m.state)) {
        clearTimeout(t)
        ws.removeEventListener('message', on)
        resolve(m.state)
      }
    })
  })
}

async function setup() {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const s = await seedStudent(db(), classId, { firstName: 'มานี' })
  const { id } = await json(await postJson(`/api/teacher/classes/${classId}/live`, { title: 'คาบ 1' }, { cookie }))
  await postJson(`/api/teacher/live/${id}/activities`, { kind: 'quiz', prompt: '2+2', options: ['3', '4'], correct: 1, seconds: 30 }, { cookie })
  return { cookie, id: id as string, sc: await studentCookie(s.id) }
}

it('สิทธิ์ต่อ WebSocket: ไม่ล็อกอิน 401, ยังไม่เริ่ม/ห้องอื่น 403, ไม่ใช่ upgrade 426', async () => {
  const { id, sc } = await setup()
  expect((await connect(id)).status).toBe(401)
  expect((await connect(id, sc)).status).toBe(403)
  const other = await seedClass(db())
  expect((await connect(id, await studentCookie((await seedStudent(db(), other.classId)).id))).status).toBe(403)
  expect((await SELF.fetch(`http://x/api/live/${id}/ws`, { headers: { cookie: sc } })).status).toBe(426)
  expect((await connect('nope', await loginTeacher())).status).toBe(404)
})

it('ครูและนักเรียนได้ state ที่ push มา; นักเรียนไม่เห็นเฉลยจนเปิดผล', async () => {
  const { cookie, id, sc } = await setup()
  const tRes = await connect(id, cookie)
  expect(tRes.status).toBe(101)
  const teacher = tRes.webSocket!
  teacher.accept()
  await postJson(`/api/teacher/live/${id}/start`, {}, { cookie })
  const sRes = await connect(id, sc)
  expect(sRes.status).toBe(101)
  const student = sRes.webSocket!
  student.accept()

  const tGot = nextState(teacher, (s) => s.current?.responseCount === 1)
  const sGot = nextState(student, (s) => s.current?.responseCount === 1)
  expect((await postJson(`/api/student/live/${id}/answer`, { choice: 1 }, { cookie: sc })).status).toBe(200)
  const ts = await tGot
  const ss = await sGot
  expect(ts.current.activity.correct).toBe(1)
  expect(ts.session.joinCode).toBeTruthy()
  expect(ss.current.activity.correct).toBeUndefined()
  expect(ss.current.results).toBeNull()

  const shown = nextState(student, (s) => s.current?.activity.showResults)
  await postJson(`/api/teacher/live/${id}/show-results`, { show: true }, { cookie })
  expect((await shown).current.activity.correct).toBe(1)

  const ended = nextState(student, (s) => s.session.status === 'ended')
  await postJson(`/api/teacher/live/${id}/end`, {}, { cookie })
  expect((await ended).session.status).toBe('ended')
  teacher.close()
  student.close()
})
