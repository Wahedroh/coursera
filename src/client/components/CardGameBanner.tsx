import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import type { StudentActiveGame } from '../../shared/cardgame'
import Icon from './Icon'

/** หน้าแรกนักเรียน: ครูเริ่มเกมการ์ดในห้องนี้ → แตะเพื่อตอบในเครื่องตัวเอง
 *  เช็กเองทุก 10 วินาที (เฉพาะตอนเปิดหน้าอยู่) + ปุ่มรีเฟรช เผื่อครูเพิ่งเริ่มเกม */
export default function CardGameBanner() {
  const [game, setGame] = useState<StudentActiveGame>(null)
  const [checking, setChecking] = useState(false)
  const [none, setNone] = useState(false)
  const check = useCallback(async (manual = false) => {
    if (!manual && document.visibilityState !== 'visible') return
    if (manual) setChecking(true)
    try {
      const g = await api<StudentActiveGame>('/api/student/card-games/active')
      setGame(g)
      if (manual) setNone(!g)
    } catch {
      // ลองใหม่รอบหน้า
    } finally {
      if (manual) setChecking(false)
    }
  }, [])
  useEffect(() => {
    const auto = () => void check()
    auto()
    const t = setInterval(auto, 10_000)
    document.addEventListener('visibilitychange', auto)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', auto)
    }
  }, [check])
  if (!game)
    return (
      <div className="mx-4 mt-3 flex items-center justify-end gap-2 text-xs text-stone-500">
        {none && <span role="status">ยังไม่มีเกมการ์ด — ถ้าครูเพิ่งเริ่ม กดอีกครั้ง</span>}
        <button type="button" onClick={() => void check(true)} disabled={checking} className="rounded-full border-2 border-line bg-white px-3 py-1 font-semibold text-stone-600 disabled:opacity-60">
          <span className={`inline-block ${checking ? 'animate-spin' : ''}`}>⟳</span> เช็กเกมการ์ด
        </button>
      </div>
    )
  return (
    <Link
      to={`/me/card-game/${game.id}`}
      className="mx-4 mt-4 block rounded-2xl bg-board text-white px-4 py-3 shadow-[0_5px_0_#133d2d] active:translate-y-0.5 active:shadow-none"
      data-testid="card-game-banner"
    >
      <b className="text-lg"><Icon n="cards" /> ครูเริ่มเกมแล้ว!</b>
      <span className="block text-sm opacity-90">
        {game.quizTitle} · แตะเพื่อตอบในเครื่องนี้ (ไม่ต้องชูการ์ด)
      </span>
    </Link>
  )
}
