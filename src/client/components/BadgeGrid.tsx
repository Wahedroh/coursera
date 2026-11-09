import type { StudentBadge } from '../../shared/badges'
import { Card } from '../ui'

export default function BadgeGrid({ badges }: { badges: StudentBadge[] }) {
  const earned = badges.filter((b) => b.earned).length
  return (
    <section className="flex flex-col gap-2" data-testid="badges">
      <h2 className="font-bold">
        🏅 เหรียญตรา ({earned}/{badges.length})
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {badges.map((b) => (
          <Card key={b.id} className={`p-2 flex flex-col items-center text-center gap-0.5 ${b.earned ? 'bg-amber-50 border-amber-200' : 'bg-stone-50'}`}>
            <span className={`text-3xl ${b.earned ? '' : 'grayscale opacity-40'}`} aria-hidden>
              {b.icon}
            </span>
            <span className={`text-xs font-bold ${b.earned ? '' : 'text-stone-500'}`}>{b.title}</span>
            <span className="text-[10px] text-stone-500 leading-tight">{b.desc}</span>
            {b.earned ? (
              <span className="text-[10px] font-bold text-amber-700">ได้แล้ว ✓</span>
            ) : (
              <span className="w-full mt-1" aria-label={`${b.title} ${b.progress}/${b.need}`}>
                <span className="block h-1.5 rounded-full bg-stone-200 overflow-hidden">
                  <span className="block h-full bg-amber-400" style={{ width: `${(b.progress / b.need) * 100}%` }} />
                </span>
                <span className="text-[10px] text-stone-500 tabular-nums">
                  {b.progress}/{b.need}
                </span>
              </span>
            )}
          </Card>
        ))}
      </div>
    </section>
  )
}
