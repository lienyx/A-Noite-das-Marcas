export function BrandMark({ className = '' }: { className?: string }) {
  return <svg className={className} width="42" height="48" viewBox="0 0 48 56" fill="none" aria-hidden="true">
    <path d="M24 2 44 14v26L24 54 4 40V14L24 2Z" stroke="currentColor" strokeWidth="1" />
    <path d="M24 7 39 17v20L24 48 9 37V17L24 7Z" stroke="currentColor" strokeWidth=".5" opacity=".5" />
    <path d="M13 28s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" stroke="currentColor" />
    <circle cx="24" cy="28" r="4" stroke="currentColor" /><circle cx="24" cy="28" r="1.5" fill="currentColor" />
    <path d="M24 12v5m0 22v5M14 17l3 3m14 16 3 3M34 17l-3 3M17 36l-3 3" stroke="currentColor" strokeWidth=".7" />
  </svg>;
}
