// Service worker ของผู้ช่วยครู: รับการแจ้งเตือน (push ไม่มีข้อมูลในตัว → ดึงข้อความจากเซิร์ฟเวอร์ด้วยคุกกี้ของนักเรียน)
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let items = []
      try {
        const res = await fetch('/api/student/push/take', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' })
        if (res.ok) items = await res.json()
      } catch {}
      // ต้องแสดงอย่างน้อย 1 รายการเสมอ (เบราว์เซอร์บังคับ)
      if (!items.length) items = [{ id: 'generic', title: 'ผู้ช่วยครู', body: 'มีอัปเดตใหม่ในห้องเรียน', url: '/me' }]
      if (items.length > 2) {
        items = [{ id: 'many', title: `มีการแจ้งเตือนใหม่ ${items.length} รายการ`, body: items.map((x) => x.title).join(' · '), url: '/me' }]
      }
      await Promise.all(
        items.map((x) =>
          self.registration.showNotification(x.title, { body: x.body, tag: x.id, icon: '/icon-192.png', badge: '/favicon.png', data: { url: x.url || '/me' } }),
        ),
      )
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/me', self.location.origin).href
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin) {
          await w.focus()
          return w.navigate(url)
        }
      }
      return self.clients.openWindow(url)
    })(),
  )
})
