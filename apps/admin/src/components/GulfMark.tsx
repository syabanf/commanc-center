/** Stand-in roundel in the Gulf logo colours. Swap for the supplied logo file when GPI sends it. */
export function GulfMark() {
  return (
    <svg viewBox="0 0 64 60" className="size-full" role="img" aria-label="Gulf Power International">
      <circle cx="32" cy="30" r="29" className="fill-ink" />
      <circle cx="32" cy="30" r="26" className="fill-white" />
      <circle cx="32" cy="30" r="23" className="fill-accent" />
      <rect x="2" y="21" width="60" height="18" rx="7" className="fill-white" />
      <text
        x="32"
        y="35"
        textAnchor="middle"
        className="font-extrabold fill-ink"
        style={{ fontSize: 15, letterSpacing: '-0.5px' }}
      >
        GPI
      </text>
    </svg>
  )
}
