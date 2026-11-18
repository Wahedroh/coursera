/** เครดิตไอคอน (เงื่อนไขการใช้ IconSaga แบบฟรี) */
export default function IconCredit({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[11px] ${className}`}>
      ไอคอนโดย{' '}
      <a href="https://iconsaga.com" target="_blank" rel="noreferrer" className="underline">
        IconSaga · iconsaga.com
      </a>
    </p>
  )
}
