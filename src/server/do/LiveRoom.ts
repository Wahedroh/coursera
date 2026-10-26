import { DurableObject } from 'cloudflare:workers'
import type { Env } from '../env'

/**
 * 1 instance ต่อไลฟ์ (`live:<id>`) — ทำหน้าที่กระจายข้อความอย่างเดียว ไม่เก็บ state
 * (ไคลเอนต์ดึง snapshot จาก D1 ทาง HTTP ทุกครั้งที่ต่อใหม่) จึงรีสตาร์ตได้โดยไม่เสียข้อมูล
 */
export class LiveRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // ตอบ ping เองโดยไม่ปลุก DO (hibernation)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/broadcast' && req.method === 'POST') {
      const { teacher, student } = (await req.json()) as { teacher: unknown; student: unknown }
      const send = (role: string, state: unknown) => {
        const msg = JSON.stringify({ type: 'state', state })
        for (const ws of this.ctx.getWebSockets(role)) {
          try {
            ws.send(msg)
          } catch {
            // socket ปิดไปแล้ว
          }
        }
      }
      send('teacher', teacher)
      send('student', student)
      return new Response('ok')
    }
    if (req.headers.get('Upgrade') === 'websocket') {
      const role = url.searchParams.get('role') === 'teacher' ? 'teacher' : 'student'
      const { 0: client, 1: server } = new WebSocketPair()
      this.ctx.acceptWebSocket(server, [role])
      return new Response(null, { status: 101, webSocket: client })
    }
    return new Response('not found', { status: 404 })
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye')
    } catch {
      // ปิดแล้ว
    }
  }
}
