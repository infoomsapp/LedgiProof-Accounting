// PATH: src/components/import/DuplicateResolver.tsx

import type { Resolution } from '../../services/import.service'

export interface DuplicateRow {
  /** Key for the resolutions map (e.g. account code, client email) */
  key:           string
  /** Display name from incoming row */
  newName:       string
  /** Display name from existing row */
  existingName:  string
  /** Extra info for the existing row (e.g. type, email) */
  existingHint?: string
}

interface Props {
  duplicates:  DuplicateRow[]
  resolutions: Record<string, Resolution>
  onChange:    (key: string, resolution: Resolution) => void
  onApplyAll:  (resolution: Resolution) => void
}

export default function DuplicateResolver({
  duplicates, resolutions, onChange, onApplyAll
}: Props) {
  if (duplicates.length === 0) {
    return (
      <div style={{
        padding: 24, textAlign: 'center',
        background: 'var(--sem-green-bg)',
        border: '0.5px solid var(--sem-green)',
        borderRadius: 10
      }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>✓</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sem-green)' }}>
          No duplicates detected
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--lp-text-muted)', marginTop: 4 }}>
          All rows are new and ready to import.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{
        padding: '12px 14px',
        background: 'var(--sem-amber-bg)',
        border: '0.5px solid var(--sem-amber)',
        borderRadius: 8,
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap'
      }}>
        <div style={{ flex: 1, fontSize: 12.5, color: 'var(--sem-amber)', fontWeight: 600 }}>
          ⚠ {duplicates.length} duplicate{duplicates.length === 1 ? '' : 's'} detected
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--lp-text-muted)', alignSelf: 'center' }}>
            Apply to all:
          </span>
          <button onClick={() => onApplyAll('skip')} style={btnStyle('var(--lp-text-muted)')}>
            Skip all
          </button>
          <button onClick={() => onApplyAll('overwrite')} style={btnStyle('var(--sem-amber)')}>
            Overwrite all
          </button>
          <button onClick={() => onApplyAll('keep_both')} style={btnStyle('var(--lp-accent)')}>
            Keep both
          </button>
        </div>
      </div>

      <div className="lp-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="lp-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Incoming row</th>
              <th>Existing in LedgiProof</th>
              <th style={{ width: 180 }}>Resolution</th>
            </tr>
          </thead>
          <tbody>
            {duplicates.map(d => (
              <tr key={d.key}>
                <td>
                  <div style={{ fontSize: 12.5, color: 'var(--lp-text)', fontWeight: 500 }}>
                    {d.newName}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)', fontFamily: 'monospace' }}>
                    {d.key}
                  </div>
                </td>
                <td>
                  <div style={{ fontSize: 12.5, color: 'var(--lp-text-muted)' }}>
                    {d.existingName}
                  </div>
                  {d.existingHint && (
                    <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)' }}>
                      {d.existingHint}
                    </div>
                  )}
                </td>
                <td>
                  <select
                    value={resolutions[d.key] ?? 'skip'}
                    onChange={e => onChange(d.key, e.target.value as Resolution)}
                    className="lp-input"
                    style={{ fontSize: 12, width: '100%' }}
                  >
                    <option value="skip">Skip — keep existing</option>
                    <option value="overwrite">Overwrite existing</option>
                    <option value="keep_both">Keep both (add as new)</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function btnStyle(color: string): React.CSSProperties {
  return {
    background:   'transparent',
    border:       `0.5px solid ${color}`,
    color,
    borderRadius: 6,
    padding:      '4px 10px',
    fontSize:     11,
    fontWeight:   500,
    cursor:       'pointer',
    fontFamily:   'inherit',
    whiteSpace:   'nowrap'
  }
}