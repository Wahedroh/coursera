import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import type { StudentActiveGame } from '../../shared/cardgame'
import Icon from './Icon'

/** หน้าแรกนักเรียน: ครูเริ่มเกมการ์ดในห้องนี้ → แตะเพื่อตอบในเครื่องตัวเอง (เช็กทุก 30 วินาที เฉพาะตอนเปิดหน้าอยู่) */
export default function CardGameBanner() {
  const [game, setGame] = useState<StudentActiveGame>(null)
  useEffect(() => {
    const load = () => document.visibilityState === 'visible' && api<StudentActiveGame>('/api/student/card-games/active').then(setGame).catch(() => {})
    load()
    const t = setInterval(load, 30_000)
    document.addEventListener('visibilitychange', load)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', load)
    }
  }, [])
  if (!game) return null
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
