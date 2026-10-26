import { OPTION_COLORS, OPTION_SYMBOLS, type LiveResults as Results } from '../../shared/live'

/** ผลรวมของกิจกรรม — ใช้ทั้งจอโปรเจกเตอร์ (big) หน้าควบคุมครู และมือถือนักเรียน */
export default function LiveResults({ results, options, big = false }: { results: Results; options?: string[]; big?: boolean }) {
  if (results.kind === 'poll' || results.kind === 'quiz') {
    const total = Math.max(1, ...results.counts)
    return (
      <div className="flex flex-col gap-2 w-full">
        {results.counts.map((n, i) => {
          const isCorrect = results.kind === 'quiz' && results.correct === i
          return (
            <div key={i} className={`flex items-center gap-2 ${big ? 'text-2xl' : 'text-sm'}`}>
              <span className={`shrink-0 font-bold ${big ? 'w-72' : 'w-28'} truncate`} title={options?.[i]}>
                <span style={{ color: OPTION_COLORS[i] }}>{OPTION_SYMBOLS[i]}</span> {options?.[i]}
                {isCorrect && ' ✓'}
              </span>
              <span className={`flex-1 rounded-lg bg-black/10 overflow-hidden ${big ? 'h-10' : 'h-5'}`}>
                <span
                  className="block h-full rounded-lg transition-all"
                  style={{ width: `${(n / total) * 100}%`, background: OPTION_COLORS[i], opacity: results.kind === 'quiz' && !isCorrect ? 0.45 : 1 }}
                />
              </span>
              <span className={`font-extrabold text-right ${big ? 'w-14' : 'w-8'}`}>{n}</span>
            </div>
          )
        })}
        {results.kind === 'quiz' && results.ranking.length > 0 && (
          <ol className={`mt-3 grid gap-1 ${big ? 'text-2xl grid-cols-2' : 'text-sm'}`} aria-label="อันดับตอบถูกเร็วที่สุด">
            {results.ranking.map((r, i) => (
              <li key={i} className="flex justify-between gap-2 rounded-lg bg-black/5 px-3 py-1">
                <span>
                  {i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}.`} {r.name}
                </span>
                <span className="opacity-70">{(r.ms / 1000).toFixed(1)} วิ</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    )
  }
  if (results.kind === 'wordcloud') {
    if (results.words.length === 0) return <p className="opacity-60">ยังไม่มีคำตอบ</p>
    const max = results.words[0].n
    return (
      <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1" data-testid="wordcloud">
        {results.words.map((w, i) => (
          <span
            key={w.word}
            className="font-extrabold leading-tight"
            style={{ fontSize: `${(big ? 1.4 : 0.9) + (w.n / max) * (big ? 3.2 : 1.4)}rem`, color: OPTION_COLORS[i % OPTION_COLORS.length] }}
            title={`${w.n} คน`}
          >
            {w.word}
          </span>
        ))}
      </div>
    )
  }
  return (
    <ul className={`grid gap-2 w-full ${big ? 'grid-cols-3 text-xl' : 'text-sm'}`}>
      {results.entries.map((e, i) => (
        <li key={i} className="rounded-xl bg-black/5 px-3 py-2">
          <b>{e.name}</b> {e.text}
        </li>
      ))}
      {results.entries.length === 0 && <li className="opacity-60">ยังไม่มีคำตอบ</li>}
    </ul>
  )
}
