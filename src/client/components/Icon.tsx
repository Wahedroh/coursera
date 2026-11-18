import { ICONS, type IconName } from '../icons'

export type { IconName }
export const isIconName = (v: string): v is IconName => Object.hasOwn(ICONS, v)

/** ไอคอนสองสีจาก IconSaga (ตกแต่ง ไม่อ่านออกเสียง) · `n` เป็นอีโมจิก็ได้ (ไอคอนสนุก ๆ ที่ยังใช้อีโมจิ) */
export default function Icon({ n, className = '' }: { n: IconName | (string & {}); className?: string }) {
  if (!isIconName(n)) return <span aria-hidden="true">{n}</span>
  return <svg className={`ic ${className}`} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[n] }} />
}
