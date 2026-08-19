// PATH: src/components/clients/TemplatePicker.tsx
//
// Sprint 5 Paso 5.4 — Reusable account template picker.
//
// USAGE PATTERNS:
//
//   1. Inline (embedded in wizard or modal):
//      <TemplatePicker
//        orgId={orgId}
//        selectedId={tplId}
//        onSelect={setTplId}
//        showPreview                          // optional
//      />
//
//   2. With preview pane (side-by-side):
//      <TemplatePicker ... showPreview />
//      → renders the dropdown + a preview panel listing items
//
// The picker does NOT clone the template — caller is responsible for
// calling useCloneTemplate.mutate({ templateId, clientId }) when ready.

import { useMemo } from 'react'
import { useAccountTemplates, useTemplateBundle } from '../../hooks/useAccountTemplates'
import type { AccountTemplate, AccountTemplateItem } from '../../types/account'

interface Props {
  /** Organization the picker scopes templates to (org members see firm-custom + all system). */
  orgId:        string

  /** Currently-selected template id. Empty string = none selected. */
  selectedId:   string

  /** Called when the user picks a different template. */
  onSelect:     (templateId: string) => void

  /** Show inline preview pane with items of selected template. Default: false. */
  showPreview?: boolean

  /** Optional label displayed above the select. Default: "Template". */
  label?:       string

  /** Optional help text under the select. */
  helpText?:    string

  /** Disable the picker (e.g. while a parent mutation is pending). */
  disabled?:    boolean
}

export default function TemplatePicker({
  orgId,
  selectedId,
  onSelect,
  showPreview = false,
  label       = 'Template',
  helpText,
  disabled    = false
}: Props) {
  const templatesQ = useAccountTemplates(orgId, {
    includeSystem: true,
    includeCustom: true
  })

  // Selected template detail (only fetched when showPreview && selectedId)
  const bundleQ = useTemplateBundle(showPreview ? selectedId : undefined)

  const templates = templatesQ.data ?? []
  const hasTemplates = templates.length > 0

  // Group system vs custom for visual separation in dropdown
  const { systemTemplates, customTemplates } = useMemo(() => {
    const sys: AccountTemplate[] = []
    const cust: AccountTemplate[] = []
    for (const t of templates) {
      if (t.is_system) sys.push(t)
      else             cust.push(t)
    }
    return { systemTemplates: sys, customTemplates: cust }
  }, [templates])

  return (
    <div style={{
      display:       'grid',
      gridTemplateColumns: showPreview ? 'minmax(0, 280px) 1fr' : '1fr',
      gap:           14,
      alignItems:    'start'
    }}>
      {/* ── Selector ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{
          fontSize: 12, color: 'var(--lp-text-muted)', fontWeight: 600
        }}>
          {label}
        </label>

        {templatesQ.isLoading && (
          <div style={{ fontSize: 12, color: 'var(--lp-text-muted)', padding: '8px 0' }}>
            Loading templates…
          </div>
        )}

        {templatesQ.isError && (
          <div style={{
            padding: '8px 12px', borderRadius: 7, fontSize: 12,
            background: 'var(--sem-red-bg)',
            border: '0.5px solid var(--sem-red-border)',
            color: 'var(--sem-red)'
          }}>
            Could not load templates. Please retry.
          </div>
        )}

        {!templatesQ.isLoading && !templatesQ.isError && !hasTemplates && (
          <div style={{
            padding: '10px 12px', borderRadius: 7, fontSize: 12,
            background: 'var(--sem-amber-bg)',
            border: '0.5px solid var(--sem-amber-border)',
            color: 'var(--lp-text)'
          }}>
            No templates available. Verify that migration v37 has been applied.
          </div>
        )}

        {!templatesQ.isLoading && hasTemplates && (
          <select
            className="lp-input"
            value={selectedId}
            onChange={e => onSelect(e.target.value)}
            disabled={disabled}
          >
            <option value="">— Select a template —</option>

            {systemTemplates.length > 0 && (
              <optgroup label="System templates">
                {systemTemplates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}

            {customTemplates.length > 0 && (
              <optgroup label="Your firm's templates">
                {customTemplates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}

        {helpText && (
          <p style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 4 }}>
            {helpText}
          </p>
        )}
      </div>

      {/* ── Preview pane ─────────────────────────────────────────────── */}
      {showPreview && (
        <TemplatePreviewPane
          isLoading={bundleQ.isLoading}
          isError={bundleQ.isError}
          template={bundleQ.data?.template ?? null}
          items={bundleQ.data?.items ?? []}
          hasSelection={!!selectedId}
        />
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
//  Sub-component: Preview pane
// ═════════════════════════════════════════════════════════════════════════════
function TemplatePreviewPane({
  isLoading, isError, template, items, hasSelection
}: {
  isLoading:    boolean
  isError:      boolean
  template:     AccountTemplate | null
  items:        AccountTemplateItem[]
  hasSelection: boolean
}) {
  // No selection yet — placeholder
  if (!hasSelection) {
    return (
      <div style={{
        padding: 14, borderRadius: 8, fontSize: 12,
        color: 'var(--lp-text-muted)', textAlign: 'center',
        border: '0.5px dashed var(--lp-border)',
        background: 'var(--lp-muted-bg)',
        minHeight: 140, display: 'flex',
        alignItems: 'center', justifyContent: 'center'
      }}>
        Select a template to preview its accounts
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{
        padding: 14, borderRadius: 8, fontSize: 12,
        color: 'var(--lp-text-muted)',
        border: '0.5px solid var(--lp-border)',
        background: 'var(--lp-muted-bg)',
        minHeight: 140
      }}>
        Loading preview…
      </div>
    )
  }

  if (isError || !template) {
    return (
      <div style={{
        padding: 14, borderRadius: 8, fontSize: 12,
        color: 'var(--sem-red)',
        background: 'var(--sem-red-bg)',
        border: '0.5px solid var(--sem-red-border)'
      }}>
        Could not load template preview.
      </div>
    )
  }

  return (
    <div style={{
      border: '0.5px solid var(--lp-border)', borderRadius: 8,
      background: 'var(--lp-muted-bg)', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', maxHeight: 320
    }}>
      {/* Header */}
      <div style={{ padding: '10px 12px', borderBottom: '0.5px solid var(--lp-border)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-text)' }}>
          {template.name}
        </div>
        {template.description && (
          <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', marginTop: 2, lineHeight: 1.4 }}>
            {template.description}
          </div>
        )}
        <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)', marginTop: 4 }}>
          {items.length} accounts · {template.is_system ? 'System template' : 'Firm-custom'}
        </div>
      </div>

      {/* Items list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 0' }}>
        {items.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--lp-text-muted)', padding: 12, textAlign: 'center' }}>
            This template has no items.
          </div>
        ) : (
          items.map(it => (
            <div key={it.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 12px',
              paddingLeft: 12 + (it.parent_code ? 16 : 0),
              fontSize: 11.5
            }}>
              <span style={{
                fontFamily: 'monospace',
                color: 'var(--lp-text-muted)',
                minWidth: 40
              }}>
                {it.code}
              </span>
              <span style={{ color: 'var(--lp-text)', flex: 1 }}>
                {it.name}
              </span>
              <span style={{
                fontSize: 10,
                color: 'var(--lp-text-muted)',
                textTransform: 'capitalize'
              }}>
                {it.type}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}