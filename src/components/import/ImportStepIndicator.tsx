// PATH: src/components/import/ImportStepIndicator.tsx

interface Step {
  label: string
}

interface Props {
  steps:   Step[]
  current: number    // 0-based
}

export default function ImportStepIndicator({ steps, current }: Props) {
  return (
    <div style={{
      display: 'flex',
      gap: 0,
      marginBottom: 24,
      padding: '0 4px'
    }}>
      {steps.map((s, i) => {
        const isDone     = i < current
        const isActive   = i === current
        const isLast     = i === steps.length - 1

        return (
          <div key={i} style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              borderRadius: 7,
              background: isActive ? 'var(--chat-bubble-mine-bg)' : 'transparent'
            }}>
              <div style={{
                width: 24, height: 24,
                borderRadius: '50%',
                background: isDone ? 'var(--sem-green)'
                          : isActive ? 'var(--lp-accent)'
                          : 'var(--lp-surface-2)',
                color: isDone || isActive ? '#fff' : 'var(--lp-text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
                border: `0.5px solid ${isDone ? 'var(--sem-green)' : isActive ? 'var(--lp-accent)' : 'var(--lp-border)'}`
              }}>
                {isDone ? '✓' : i + 1}
              </div>
              <div style={{
                fontSize: 12,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--lp-text)'
                     : isDone ? 'var(--lp-text)'
                     : 'var(--lp-text-muted)',
                whiteSpace: 'nowrap'
              }}>
                {s.label}
              </div>
            </div>
            {!isLast && (
              <div style={{
                flex: 1,
                height: 1,
                background: isDone ? 'var(--sem-green)' : 'var(--lp-border)',
                margin: '0 4px',
                minWidth: 12
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}