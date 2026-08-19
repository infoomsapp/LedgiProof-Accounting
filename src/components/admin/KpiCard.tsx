// PATH: src/components/admin/KpiCard.tsx
// Shared compact KPI card used across the command center.

interface KpiCardProps {
  label:        string
  value:        string | number
  subValue?:    string
  color:        string
  icon?:        string
  highlighted?: boolean
}

export default function KpiCard({
  label, value, subValue, color, icon, highlighted = false
}: KpiCardProps) {
  return (
    <div style={{
      padding: '12px 14px',
      borderRadius: 10,
      background: highlighted
        ? `linear-gradient(135deg, ${color}10, ${color}05)`
        : 'var(--lp-surface)',
      border: highlighted
        ? `0.5px solid ${color}50`
        : '0.5px solid var(--lp-border)',
      transition: 'all 0.15s'
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 5
      }}>
        <span style={{
          fontSize: 10.5, color: 'var(--lp-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600
        }}>
          {label}
        </span>
        {icon && <span style={{ fontSize: 13 }}>{icon}</span>}
      </div>

      <div style={{
        fontSize: 22, fontWeight: 700, color, letterSpacing: '-0.02em',
        lineHeight: 1.1, marginBottom: 3
      }}>
        {value}
      </div>

      {subValue && (
        <div style={{ fontSize: 11, color: '#64748b' }}>
          {subValue}
        </div>
      )}
    </div>
  )
}