// PATH: src/components/import/ImportPreviewTable.tsx

interface Props {
  /** Column labels in display order */
  columns: string[]
  /** Rows in same order as columns */
  rows:    string[][]
  /** Optional per-row errors */
  errors?: Map<number, string>
  /** Max rows to render (default 20) */
  maxVisible?: number
}

export default function ImportPreviewTable({
  columns, rows, errors, maxVisible = 20
}: Props) {
  const visible = rows.slice(0, maxVisible)
  const hidden  = Math.max(0, rows.length - visible.length)
  const errorCount = errors ? errors.size : 0

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        fontSize: 11.5,
        color: 'var(--lp-text-muted)'
      }}>
        <span>Showing {visible.length} of {rows.length} rows</span>
        {errorCount > 0 && (
          <span style={{ color: 'var(--sem-red)', fontWeight: 600 }}>
            ⚠ {errorCount} row{errorCount === 1 ? '' : 's'} with errors
          </span>
        )}
      </div>

      <div className="lp-card" style={{ padding: 0, overflow: 'auto', maxHeight: 420 }}>
        <table className="lp-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th style={{ width: 40, textAlign: 'right', color: 'var(--lp-text-muted)' }}>#</th>
              {columns.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => {
              const err = errors?.get(i)
              return (
                <tr key={i} style={err ? { background: 'var(--sem-red-bg)' } : undefined}>
                  <td style={{
                    textAlign: 'right',
                    color: err ? 'var(--sem-red)' : 'var(--lp-text-muted)',
                    fontSize: 11,
                    fontFamily: 'monospace'
                  }}>
                    {i + 1}
                  </td>
                  {row.map((cell, j) => (
                    <td key={j} style={{
                      fontSize: 12,
                      color: 'var(--lp-text)',
                      maxWidth: 200,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {cell}
                    </td>
                  ))}
                  {err && (
                    <td style={{ fontSize: 11, color: 'var(--sem-red)', fontStyle: 'italic' }}>
                      {err}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {hidden > 0 && (
        <div style={{
          marginTop: 6,
          fontSize: 11,
          color: 'var(--lp-text-muted)',
          textAlign: 'center'
        }}>
          + {hidden} more row{hidden === 1 ? '' : 's'} not shown
        </div>
      )}
    </div>
  )
}