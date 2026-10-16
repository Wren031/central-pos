import { getPosType } from '@/lib/pos-types'

/** Small decorative preview of a POS workspace, tinted by the type's theme. */
export function PosPreview({ posType }: { posType: string }) {
  const def = getPosType(posType)
  const t = def.theme
  return (
    <div
      className="relative h-24 overflow-hidden rounded-lg border"
      style={{ backgroundColor: t.accentSoft }}
      aria-hidden
    >
      <div className="flex items-center gap-1.5 border-b bg-white/70 px-2 py-1.5">
        <span className="size-2 rounded-full" style={{ backgroundColor: t.chart[0] }} />
        <span className="size-2 rounded-full bg-black/10" />
        <span className="size-2 rounded-full bg-black/10" />
        <span className="ml-1 text-[8px] font-semibold" style={{ color: t.accent }}>
          {def.name}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-1.5 p-2">
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-9 rounded bg-white/80"
              style={{ borderBottom: `3px solid ${t.chart[i % 3]}` }}
            />
          ))}
          <div className="col-span-3 flex h-6 items-end gap-0.5 rounded bg-white/60 px-1 py-0.5">
            {[40, 65, 35, 80, 55, 70, 45].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t"
                style={{ height: `${h}%`, backgroundColor: t.chart[i % 3], opacity: 0.85 }}
              />
            ))}
          </div>
        </div>
        <div className="w-12 space-y-1 rounded bg-white/80 p-1">
          <div className="h-1.5 rounded bg-black/10" />
          <div className="h-1.5 w-2/3 rounded" style={{ backgroundColor: t.accent }} />
          <div className="mt-2 h-3 rounded" style={{ backgroundColor: t.accent }} />
        </div>
      </div>
    </div>
  )
}
