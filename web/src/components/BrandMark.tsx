/** Viewfinder brackets around a square: the camera that watches, the point it looks for. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg className="brand__mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <rect className="brand__dot" x="9" y="9" width="6" height="6" />
    </svg>
  )
}
