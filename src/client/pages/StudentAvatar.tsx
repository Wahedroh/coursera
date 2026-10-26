import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, ApiClientError } from '../api'
import { AvatarArt } from '../components/PixelArt'
import { DEFAULT_AVATAR, HAIR_COLORS, HAIR_LABEL, HAIR_STYLES, JOB_IDS, JOBS, SKINS, type AvatarConfig } from '../../shared/avatar'
import { Button, Card, ErrorBox, Loading } from '../ui'

const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="font-bold mb-2">{label}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  )
}

const chip = (on: boolean) => `rounded-xl border-[3px] px-3 py-1.5 text-sm font-bold ${on ? 'border-ink ring-2 ring-amber-400' : 'border-line bg-white'}`
const swatch = (on: boolean) => `w-10 h-10 rounded-lg border-[3px] ${on ? 'border-ink ring-2 ring-amber-400' : 'border-line'}`

export default function StudentAvatar() {
  const navigate = useNavigate()
  const [cfg, setCfg] = useState<AvatarConfig | null>(null)
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ nickname: string; config: AvatarConfig }>('/api/student/avatar')
      .then((a) => {
        setCfg(a.config)
        setNickname(a.nickname)
      })
      .catch((e) => (e instanceof ApiClientError && e.status === 401 ? navigate('/', { replace: true }) : setError(e.message)))
  }, [navigate])

  if (!cfg) return error ? <ErrorBox message={error} /> : <Loading />
  const set = (p: Partial<AvatarConfig>) => {
    setCfg({ ...cfg, ...p })
    setSaved(false)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await api('/api/student/avatar', { method: 'PUT', body: { nickname, config: cfg } })
      setSaved(true)
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  function randomize() {
    set({
      gender: pick(['m', 'f'] as const),
      skin: Math.floor(Math.random() * SKINS.length),
      hair: pick(HAIR_STYLES),
      hairColor: Math.floor(Math.random() * HAIR_COLORS.length),
      job: pick(JOB_IDS),
      glasses: Math.random() < 0.25,
    })
  }

  return (
    <main className="min-h-screen max-w-md mx-auto pb-8">
      <header className="bg-board text-white px-5 pt-5 pb-6 rounded-b-3xl">
        <Link to="/me" className="text-sm opacity-85">
          ← งานของฉัน
        </Link>
        <h1 className="text-xl font-extrabold mt-2">แต่งตัวละครของฉัน</h1>
      </header>
      <section className="p-5 flex flex-col gap-5">
        <Card className="p-4 flex flex-col gap-5 bg-[#FDFBF3]">
          <div className="bg-[#E8DFC4] border-4 border-[#D2C9AE] flex flex-col items-center justify-center py-6 gap-2" data-testid="avatar-preview">
            <AvatarArt config={cfg} size={14} />
            <span className="font-bold text-lg min-h-7">{nickname.trim()}</span>
          </div>
          <label className="font-bold flex flex-col gap-2">
            ชื่อในเกม
            <input
              className="border-[3px] border-line rounded-xl px-3 py-3 bg-[#F4F1E6] font-normal"
              placeholder="ตั้งชื่อ"
              maxLength={20}
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value)
                setSaved(false)
              }}
            />
          </label>
          <Group label="เพศ">
            {(['m', 'f'] as const).map((g) => (
              <button key={g} type="button" aria-pressed={cfg.gender === g} className={chip(cfg.gender === g)} onClick={() => set({ gender: g })}>
                {g === 'm' ? 'ชาย' : 'หญิง'}
              </button>
            ))}
          </Group>
          <Group label="สีผิว">
            {SKINS.map((c, i) => (
              <button key={c} type="button" aria-label={`สีผิว ${i + 1}`} aria-pressed={cfg.skin === i} className={swatch(cfg.skin === i)} style={{ background: c }} onClick={() => set({ skin: i })} />
            ))}
          </Group>
          <Group label="ทรงผม">
            {HAIR_STYLES.map((h) => (
              <button key={h} type="button" aria-pressed={cfg.hair === h} className={chip(cfg.hair === h)} onClick={() => set({ hair: h })}>
                {HAIR_LABEL[h]}
              </button>
            ))}
          </Group>
          <Group label="สีผม">
            {HAIR_COLORS.map((c, i) => (
              <button key={c} type="button" aria-label={`สีผม ${i + 1}`} aria-pressed={cfg.hairColor === i} className={swatch(cfg.hairColor === i)} style={{ background: c }} onClick={() => set({ hairColor: i })} />
            ))}
          </Group>
          <Group label="อาชีพ">
            {JOB_IDS.map((j) => (
              <button key={j} type="button" aria-pressed={cfg.job === j} className={chip(cfg.job === j)} onClick={() => set({ job: j })}>
                {JOBS[j].label}
              </button>
            ))}
          </Group>
          <Group label="เครื่องประดับ">
            <button type="button" aria-pressed={cfg.glasses} className={chip(cfg.glasses)} onClick={() => set({ glasses: !cfg.glasses })}>
              👓 แว่นตา
            </button>
          </Group>
        </Card>
        <ErrorBox message={error} />
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button type="button" variant="ghost" onClick={randomize}>
            🎲 สุ่ม
          </Button>
          <Button type="button" onClick={save} disabled={busy}>
            {saved ? '✓ บันทึกแล้ว' : 'บันทึกตัวละคร'}
          </Button>
        </div>
        <button type="button" className="text-sm text-stone-500" onClick={() => set(DEFAULT_AVATAR)}>
          กลับเป็นค่าเริ่มต้น
        </button>
      </section>
    </main>
  )
}
