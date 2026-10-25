import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-board text-white shadow-[0_3px_0_#123b2c] disabled:opacity-60',
  ghost: 'bg-white text-ink border-2 border-line',
  danger: 'bg-white text-red-700 border-2 border-red-200',
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 font-bold active:translate-y-px ${VARIANTS[variant]} ${className}`}
    />
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white border-[1.5px] border-line rounded-2xl ${className}`}>{children}</div>
}

export function Chip({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'purple' }) {
  const tones = {
    gray: 'bg-stone-100 text-stone-600',
    green: 'bg-board-soft text-board',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-violet-100 text-violet-700',
  }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
      {message}
    </p>
  )
}

export function Loading() {
  return <p className="text-stone-500 text-sm p-6">กำลังโหลด…</p>
}
