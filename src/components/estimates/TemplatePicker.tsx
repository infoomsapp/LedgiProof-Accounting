// PATH: src/components/estimates/TemplatePicker.tsx
//
// REFACTOR v32 (CSS Sprint):
//   · Inline styles → CSS variables (var(--lp-*)) where structural
//   · Custom button styling → .lp-input for search, kept inline for hover-state
//     transitions (dynamic colors based on suggested flag — can't express in
//     pure CSS without component-level state)
//   · Section header pattern extracted as inline (used only here)
//
// Logic 100% preserved.

import { useMemo, useState } from 'react'
import {
  ESTIMATE_TEMPLATE_CATEGORY_LABELS,
  type EstimateTemplate,
  type EstimateTemplateCategory
} from '../../types/estimate'
import { useEstimateTemplates } from '../../hooks/useEstimates'
import Modal from '../ui/modal'
import SemaphoreSpinner from '../ui/SemaphoreSpinner'

interface Props {
  open:                 boolean
  onClose:              () => void
  onSelect:             (template: EstimateTemplate) => void
  suggestedCategories?: EstimateTemplateCategory[]
  orgId?:               string
}

type Group = 'trade' | 'driver' | 'service' | 'generic'

const GROUP_HEADERS: Record<Group, { label: string; emoji: string; description: string }> = {
  trade:   { label: 'Trades',                emoji: '🛠',  description: 'Skilled labor — repair, installation, maintenance' },
  driver:  { label: 'Drivers & Transport',   emoji: '🚖', description: 'Gig economy + commercial transport' },
  service: { label: 'Professional Services', emoji: '💼', description: 'Knowledge work — consulting, design, IT, legal' },
  generic: { label: 'Generic',               emoji: '📋', description: 'Blank or general B2B starters' }
}

export default function TemplatePicker({
  open,
  onClose,
  onSelect,
  suggestedCategories = [],
  orgId
}: Props) {
  const [search, setSearch] = useState('')
  const { data: allTemplates = [], isLoading } = useEstimateTemplates()

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = allTemplates.filter(t => {
      if (!t.is_active) return false
      if (!t.is_global && t.org_id !== orgId) return false
      if (q) {
        const haystack = `${t.name} ${t.description ?? ''} ${t.category}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })

    const groups: Record<Group, EstimateTemplate[]> = {
      trade: [], driver: [], service: [], generic: []
    }
    for (const t of filtered) {
      const meta = ESTIMATE_TEMPLATE_CATEGORY_LABELS[t.category]
      if (!meta) continue
      groups[meta.group].push(t)
    }
    return groups
  }, [allTemplates, search, orgId])

  const totalShown = grouped.trade.length + grouped.driver.length +
                     grouped.service.length + grouped.generic.length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Choose a template"
      subtitle="Start from a pre-built template or use the blank one to create from scratch."
      width={760}
    >
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 14,
        maxHeight: '70vh', overflow: 'hidden'
      }}>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search templates by name, profession, or service…"
          autoFocus
          className="lp-input"
        />

        {/* Loading */}
        {isLoading && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <SemaphoreSpinner size="md" inline />
          </div>
        )}

        {/* Empty search results */}
        {!isLoading && totalShown === 0 && (
          <div style={{
            padding: '40px 20px', textAlign: 'center',
            color: 'var(--lp-text-muted)', fontSize: 13
          }}>
            <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>🔍</div>
            No templates match your search.
          </div>
        )}

        {/* Groups */}
        {!isLoading && totalShown > 0 && (
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
            {(['trade', 'driver', 'service', 'generic'] as Group[]).map(group => {
              const items = grouped[group]
              if (items.length === 0) return null
              const header = GROUP_HEADERS[group]

              return (
                <div key={group} style={{ marginBottom: 18 }}>
                  {/* Section header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 8, padding: '4px 2px'
                  }}>
                    <span style={{ fontSize: 14 }}>{header.emoji}</span>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="lp-section-label" style={{ margin: 0 }}>
                        {header.label}{' '}
                        <span style={{ color: 'var(--lp-text-muted)', fontWeight: 500, opacity: 0.7 }}>
                          · {items.length}
                        </span>
                      </span>
                      <span style={{ fontSize: 10.5, color: 'var(--lp-text-muted)' }}>
                        {header.description}
                      </span>
                    </div>
                  </div>

                  {/* Cards grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 8
                  }}>
                    {items.map(template => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        suggested={suggestedCategories.includes(template.category)}
                        onClick={() => onSelect(template)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// One card per template
// ─────────────────────────────────────────────────────────────────────────────

function TemplateCard({
  template, suggested, onClick
}: {
  template:  EstimateTemplate
  suggested: boolean
  onClick:   () => void
}) {
  const meta = ESTIMATE_TEMPLATE_CATEGORY_LABELS[template.category]
  const itemCount = Array.isArray(template.default_items)
    ? template.default_items.length
    : 0

  // Suggested cards use accent border, normal cards use --lp-border.
  // Hover state changes border to accent. This is dynamic enough that
  // CSS-only (no JS) would require a custom utility class — keeping inline
  // for the suggested-flag conditional, which is component-specific.
  const baseBg     = suggested ? 'rgba(59,130,246,0.06)' : 'rgba(255,255,255,0.02)'
  const baseBorder = suggested ? 'rgba(59,130,246,0.40)' : 'var(--lp-border)'
  const hoverBg    = suggested ? 'rgba(59,130,246,0.10)' : 'rgba(255,255,255,0.05)'

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '12px',
        background: baseBg,
        border: `0.5px solid ${baseBorder}`,
        borderRadius: 8,
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transition: 'background 0.15s, border-color 0.15s'
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background  = hoverBg
        e.currentTarget.style.borderColor = 'var(--lp-accent)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background  = baseBg
        e.currentTarget.style.borderColor = baseBorder
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{meta?.emoji ?? '📝'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 600, color: 'var(--lp-text)',
            lineHeight: 1.3, marginBottom: 2
          }}>
            {template.name}
          </div>
          <div style={{
            fontSize: 10.5, color: 'var(--lp-text-muted)',
            display: 'flex', alignItems: 'center', gap: 6
          }}>
            <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
            {template.default_valid_days && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span>{template.default_valid_days}d valid</span>
              </>
            )}
            {!template.is_global && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span style={{ color: '#a78bfa' }}>Custom</span>
              </>
            )}
          </div>
        </div>
        {suggested && (
          <span style={{
            fontSize: 9,
            padding: '2px 6px',
            background: 'rgba(59,130,246,0.20)',
            color: '#60a5fa',
            borderRadius: 100,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            flexShrink: 0
          }}>
            Suggested
          </span>
        )}
      </div>

      {template.description && (
        <div style={{
          fontSize: 11, color: 'var(--lp-text-muted)',
          lineHeight: 1.45, paddingLeft: 26,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}>
          {template.description}
        </div>
      )}
    </button>
  )
}