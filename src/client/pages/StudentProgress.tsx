import { EXP_PER_LEVEL } from '../../shared/points'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiClientError } from '../api'
import { characterById, charactersOfSeason, RARITY_LABEL, SEASONS } from '../../shared/characters'
import { AvatarArt, CharacterArt, EggArt, ItemArt } from '../components/PixelArt'
import { EGG_ITEMS, eggItemById, ITEM_KIND_LABEL, type ItemKind } from '../../shared/eggItems'
import type { AvatarConfig } from '../../shared/avatar'
import { Button, Card, ErrorBox, Loading } from '../ui'
import BadgeGrid from '../components/BadgeGrid'
import type { StudentBadge } from '../../shared/badges'

type Progress = {
  exp: number
  level: number
  nextLevelAt: number
  term: { name: string; season: number }
  eggs: { id: string; level: number; characterId: string | null; openedAt: number | null; season: number; termName: string | null }[]
  history: { delta: number; reason: string; createdAt: number }[]
  /** กติกาครู: สะสมครบชุดซีซันเทอมนี้ได้เกรดนี้ (null = ไม่ได้เปิดกติกา) */
  fullSetReward: { grade: string; minExamPct: number } | null
  /** ของแถมที่มี · กล่องของขวัญรอเปิด (ไข่ที่เปิดก่อนมีของแถม) */
  items: string[]
  gifts: number
}
type Rank = { rank: number; firstName: string; exp: number; level: number; isMe: boolean; avatar: AvatarConfig }

export default function StudentProgress() {
  const navigate = useNavigate()
  const [p, setP] = useState<Progress | null>(null)
  const [board, setBoard] = useState<Rank[] | null>(null)
  const [badges, setBadges] = useState<StudentBadge[] | null>(null)
  const [opened, setOpened] = useState<{ characterId: string | null; bonus: string | null } | null>(null)
  // กันกดรัว (กดซ้ำระหว่างรอจะได้ 409)
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api<Progress>('/api/student/progress')
      .then(setP)
      .catch((e) => (e instanceof ApiClientError && e.status === 401 ? navigate('/', { replace: true }) : setError(e.message)))
    api<Rank[]>('/api/student/leaderboard').then(setBoard).catch(() => setBoard(null))
    api<StudentBadge[]>('/api/student/badges').then(setBadges).catch(() => {})
  }, [navigate])
  useEffect(load, [load])

  async function open(eggId: string) {
    if (opening) return
    setOpening(eggId)
    try {
      setOpened(await api<{ characterId: string; bonus: string | null }>(`/api/student/eggs/${eggId}/open`, { body: {} }))
      load()
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'เปิดไข่ไม่สำเร็จ')
    } finally {
      setOpening(null)
    }
  }

  async function openGift() {
    if (opening) return
    setOpening('gift')
    try {
      const r = await api<{ bonus: string | null }>('/api/student/gifts/open', { body: {} })
      setOpened({ characterId: null, bonus: r.bonus })
      load()
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'เปิดกล่องไม่สำเร็จ')
    } finally {
      setOpening(null)
    }
  }

  if (!p) return error ? <ErrorBox message={error} /> : <Loading />
  const owned = new Set(p.eggs.flatMap((e) => (e.characterId ? [e.characterId] : [])))
  const pending = p.eggs.filter((e) => !e.characterId)
  const prev = p.level * EXP_PER_LEVEL
  const pct = Math.max(0, Math.min(100, ((p.exp - prev) / (p.nextLevelAt - prev)) * 100))
  const got = opened?.characterId ? characterById(opened.characterId) : null
  const bonus = opened?.bonus ? eggItemById(opened.bonus) : null
  const mine = new Set(p.items)

  return (
    <main className="min-h-screen max-w-md mx-auto pb-8">
      <header className="bg-board text-white px-5 pt-5 pb-6 rounded-b-3xl">
        <div className="flex justify-between items-baseline">
          <Link to="/me" className="text-sm opacity-85">
            ← งานของฉัน
          </Link>
          <span className="text-xs opacity-85">เทอม {p.term.name}</span>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-4xl font-extrabold text-amber-300">LV {p.level}</span>
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1">
              <span>{p.exp} EXP</span>
              <span>อีก {p.nextLevelAt - p.exp} EXP ได้ไข่ใบใหม่</span>
            </div>
            <div className="h-2.5 rounded-full bg-white/25 overflow-hidden">
              <div className="h-full bg-amber-300 rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </header>
      <section className="p-5 flex flex-col gap-3">
        <ErrorBox message={error} />
        {opened && (
          <div data-testid="egg-result">
            <Card className="p-4 text-center bg-amber-50 border-amber-200 flex flex-col items-center gap-3">
              <div className="flex items-end justify-center gap-4 flex-wrap">
                {got && (
                  <div className="flex flex-col items-center gap-1">
                    <CharacterArt id={got.id} size={8} />
                    <b>
                      {got.name} ({RARITY_LABEL[got.rarity]})
                    </b>
                    <span className="text-xs text-stone-500">สัตว์วิเศษ</span>
                  </div>
                )}
                {got && bonus && <span className="text-3xl font-extrabold text-amber-600 self-center">+</span>}
                {bonus && (
                  <div className="flex flex-col items-center gap-1">
                    <ItemArt id={bonus.id} size={7} />
                    <b>
                      {bonus.name} ({RARITY_LABEL[bonus.rarity]})
                    </b>
                    <span className="text-xs text-stone-500">{ITEM_KIND_LABEL[bonus.kind]}</span>
                  </div>
                )}
              </div>
              {!bonus && <p className="text-sm text-stone-500">{got ? 'ครั้งนี้ไม่ได้ของแถม — ไข่ใบหน้าลุ้นใหม่!' : 'กล่องนี้ว่างเปล่า — ลุ้นกล่องต่อไปนะ!'}</p>}
              {bonus && bonus.kind !== 'secret' && (
                <Link to="/me/avatar" className="rounded-xl bg-board text-white px-4 py-1.5 text-sm font-bold">
                  ไปใส่ที่ตัวละคร
                </Link>
              )}
            </Card>
          </div>
        )}
        {p.gifts > 0 && (
          <Card className="p-4 flex items-center gap-3 bg-violet-50 border-violet-200">
            <span className="text-4xl" aria-hidden>
              🎁
            </span>
            <div className="flex-1">
              <b>กล่องของขวัญ {p.gifts} กล่อง</b>
              <p className="text-xs text-stone-500">จากไข่ที่เคยเปิดไปแล้ว · ลุ้นอุปกรณ์ ชุดพิเศษ ตัวละครลึกลับ</p>
            </div>
            <Button onClick={openGift} disabled={opening !== null} className="px-3 py-2">
              เปิดกล่อง
            </Button>
          </Card>
        )}
        {pending.map((e) => (
          <Card key={e.id} className="p-4 flex items-center gap-3 bg-amber-50 border-amber-200">
            <EggArt size={6} />
            <div className="flex-1">
              <b>มีไข่รอเปิด!</b>
              <p className="text-xs text-stone-500">
                ได้จากการขึ้น LV {e.level}
                {e.termName && e.termName !== p.term.name && <> เทอม {e.termName}</>} · {SEASONS.find((x) => x.season === e.season)?.name ?? ''}
              </p>
            </div>
            <Button onClick={() => open(e.id)} disabled={opening !== null} className="bg-amber-400 text-amber-950 shadow-[0_3px_0_#c48d1c] px-3 py-2">
              เปิดไข่ 🥚
            </Button>
          </Card>
        ))}
        {badges && <BadgeGrid badges={badges} />}
        {[...SEASONS]
          // แสดงเฉพาะซีซันของเทอมนี้ และซีซันที่เคยสะสมไว้ (ไม่โชว์ซีซันหน้า)
          .filter(({ season }) => season === p.term.season || charactersOfSeason(season).some((c) => owned.has(c.id)))
          // ซีซันของเทอมนี้ขึ้นก่อน
          .sort((a, b) => (b.season === p.term.season ? 1 : 0) - (a.season === p.term.season ? 1 : 0))
          .map(({ season, name }) => {
            const set = charactersOfSeason(season)
            const have = set.filter((c) => owned.has(c.id)).length
            return (
              <section key={season} className="flex flex-col gap-2" data-testid={`collection-s${season}`}>
                <h2 className="font-bold flex items-baseline gap-2">
                  {name} ({have}/{set.length})
                  {season === p.term.season && <span className="text-xs font-semibold text-amber-600">เทอมนี้</span>}
                  {have === set.length && <span className="text-xs">🏆 ครบชุด!</span>}
                </h2>
                {season === p.term.season && p.fullSetReward && (
                  <p className={`rounded-xl px-3 py-2 text-sm font-semibold ${have === set.length ? 'bg-board-soft text-board' : 'bg-amber-50 text-amber-800 border border-amber-200'}`} data-testid="fullset-reward">
                    {have === set.length
                      ? `🎉 สะสมครบ ${set.length} ตัวแล้ว!${p.fullSetReward.minExamPct > 0 ? ` ถ้าคะแนนสอบทุกครั้งได้ ${p.fullSetReward.minExamPct}% ขึ้นไป ได้เกรด ${p.fullSetReward.grade}` : ` ได้เกรด ${p.fullSetReward.grade} ตามกติกาครู`}`
                      : `🏆 กติกาครู: สะสมครบ ${set.length} ตัว${p.fullSetReward.minExamPct > 0 ? ` + สอบทุกครั้งได้ ${p.fullSetReward.minExamPct}% ขึ้นไป` : ''} ได้เกรด ${p.fullSetReward.grade} · อีก ${set.length - have} ตัว`}
                  </p>
                )}
                <div className="grid grid-cols-4 gap-2">
                  {set.map((c) => (
                    <Card key={c.id} className={`p-2 flex flex-col items-center text-center ${owned.has(c.id) ? '' : 'bg-stone-50'}`}>
                      {owned.has(c.id) ? <CharacterArt id={c.id} size={4} /> : <span className="h-10 flex items-center text-2xl text-stone-300">?</span>}
                      <span className="text-[10px] font-semibold mt-1">{owned.has(c.id) ? c.name : '???'}</span>
                      <span className="text-[10px] text-stone-400">{RARITY_LABEL[c.rarity]}</span>
                    </Card>
                  ))}
                </div>
              </section>
            )
          })}
        <ItemCollection mine={mine} />
        {board && (
          <>
            <h2 className="font-bold mt-2">กระดานจัดอันดับห้อง</h2>
            <Card className="p-2">
              {board.map((r, i) => (
                <div key={i} className={`flex justify-between items-center px-2 py-1.5 text-sm ${r.isMe ? 'bg-board-soft rounded-lg font-bold' : ''}`}>
                  <span className="flex items-center gap-2">
                    <span className="w-5 text-right">{r.rank}.</span>
                    <AvatarArt config={r.avatar} size={2} label={r.firstName} />
                    {r.firstName}
                  </span>
                  <span>
                    LV {r.level} · {r.exp}
                  </span>
                </div>
              ))}
            </Card>
          </>
        )}
        <h2 className="font-bold mt-2">ประวัติแต้ม</h2>
        <Card className="p-2">
          {p.history.length === 0 && <p className="text-sm text-stone-500 p-2">ยังไม่มีแต้ม</p>}
          {p.history.map((h, i) => (
            <div key={i} className="flex justify-between px-2 py-1.5 text-sm border-b border-stone-100 last:border-0">
              <span>{h.reason}</span>
              <b className={h.delta > 0 ? 'text-board' : 'text-red-600'}>
                {h.delta > 0 ? '+' : ''}
                {h.delta}
              </b>
            </div>
          ))}
        </Card>
      </section>
    </main>
  )
}

const KINDS: ItemKind[] = ['hand', 'offhand', 'outfit', 'secret']

/** ของสะสมจากไข่: อุปกรณ์ · ชุดพิเศษ · ตัวละครลึกลับ (ยังไม่ได้ = ???) */
function ItemCollection({ mine }: { mine: ReadonlySet<string> }) {
  const have = EGG_ITEMS.filter((x) => mine.has(x.id)).length
  return (
    <section className="flex flex-col gap-2" data-testid="item-collection">
      <h2 className="font-bold flex items-baseline gap-2">
        ของแถมจากไข่ ({have}/{EGG_ITEMS.length})
        <Link to="/me/avatar" className="ml-auto text-xs font-semibold text-board underline">
          ไปแต่งตัวละคร
        </Link>
      </h2>
      <p className="text-xs text-stone-500">เปิดไข่มีโอกาสได้ของแถม 75% · ตัวละครลึกลับไม่นับในชุดสัตว์วิเศษ</p>
      {KINDS.map((k) => (
        <div key={k}>
          <b className="text-xs text-stone-500">{ITEM_KIND_LABEL[k]}</b>
          <div className="grid grid-cols-4 gap-2 mt-1">
            {EGG_ITEMS.filter((x) => x.kind === k).map((x) => (
              <Card key={x.id} className={`p-2 flex flex-col items-center text-center ${mine.has(x.id) ? (k === 'secret' ? 'border-violet-300 bg-violet-50' : '') : 'bg-stone-50'}`}>
                <span className="h-12 flex items-center">{mine.has(x.id) ? <ItemArt id={x.id} size={4} /> : <span className="text-2xl text-stone-300">?</span>}</span>
                <span className="text-[10px] font-semibold mt-1">{mine.has(x.id) || k !== 'secret' ? x.name : '???'}</span>
                <span className="text-[10px] text-stone-400">{RARITY_LABEL[x.rarity]}</span>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
