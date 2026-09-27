// PATH: src/components/ui/SemaphoreMark.tsx
// The four semaphore states every transaction lands in -- blue verified,
// green processed, amber needs your eyes, red looks off -- as a small mark.
// LedgiProof's signature on full-screen moments (setup, choose a plan).

const SEMAPHORE = ['var(--sem-blue)', 'var(--sem-green)', 'var(--sem-amber)', 'var(--sem-red)']

export default function SemaphoreMark({ size = 9 }: { size?: number }) {
  return (
    <div aria-hidden style={{ display: 'flex', gap: Math.round(size * 0.55) }}>
      {SEMAPHORE.map(c => (
        <span key={c} style={{ width: size, height: size, borderRadius: '50%', background: c }} />
      ))}
    </div>
  )
}
