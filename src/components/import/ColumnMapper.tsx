// PATH: src/components/import/ColumnMapper.tsx

export interface SchemaField {
  field:     string         // canonical name (e.g. 'display_name')
  label:     string         // UI label (e.g. 'Client name')
  required:  boolean
  synonyms:  string[]
  hint?:     string
}

interface Props {
  headers:      string[]
  schema:       SchemaField[]
  mapping:      Record<string, string | null>
  onChange:     (field: string, header: string | null) => void
  sampleRow?:   Record<string, string>     // first row of data, shown next to each header
}

export default function ColumnMapper({ headers, schema, mapping, onChange, sampleRow }: Props) {
  return (
    <div className="lp-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        padding: '10px 14px',
        background: 'var(--lp-surface-2)',
        borderBottom: '0.5px solid var(--lp-border)',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
        fontSize: 10.5,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--lp-text-muted)'
      }}>
        <div>LedgiProof field</div>
        <div>Your column</div>
      </div>

      <div style={{ padding: '8px 0' }}>
        {schema.map(field => {
          const currentHeader = mapping[field.field]
          const sample = currentHeader != null ? sampleRow?.[currentHeader] : undefined

          return (
            <div key={field.field} style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              padding: '10px 14px',
              borderBottom: '0.5px solid var(--chat-row-divider)',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--lp-text)' }}>
                  {field.label}
                  {field.required && (
                    <span style={{ color: 'var(--sem-red)', marginLeft: 4 }}>*</span>
                  )}
                </div>
                {field.hint && (
                  <div style={{ fontSize: 10.5, color: 'var(--lp-text-muted)', marginTop: 2 }}>
                    {field.hint}
                  </div>
                )}
              </div>

              <div>
                <select
                  value={currentHeader ?? ''}
                  onChange={e => {
                    const v = e.target.value
                    onChange(field.field, v === '' ? null : v)
                  }}
                  className="lp-input"
                  style={{ width: '100%', fontSize: 12 }}
                >
                  <option value="">— Skip / Not in file —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={h}>
                      {h || `(column ${i + 1})`}
                    </option>
                  ))}
                </select>
                {sample && (
                  <div style={{
                    fontSize: 10.5,
                    color: 'var(--lp-text-muted)',
                    fontFamily: 'monospace',
                    marginTop: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    Sample: {sample}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function validateMapping(
  schema: SchemaField[],
  mapping: Record<string, string | null>
): string | null {
  const missing = schema
    .filter(f => f.required && mapping[f.field] == null)
    .map(f => f.label)
  if (missing.length > 0) {
    return `Missing required field(s): ${missing.join(', ')}`
  }
  return null
}
