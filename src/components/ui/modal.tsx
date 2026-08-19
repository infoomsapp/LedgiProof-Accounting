import { useEffect, useId, type ReactNode, type MouseEvent } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  width?: number
  danger?: boolean
}

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 480,
  danger = false
}: ModalProps) {
  const titleId = useId()
  const subtitleId = useId()

  // Close on Escape + lock body scroll
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handler)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handler)
    }
  }, [open, onClose])

  if (!open) return null

  function stopPanelClick(e: MouseEvent<HTMLDivElement>) {
    e.stopPropagation()
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(3px)',
          animation: 'lp-modal-fade-in 0.15s ease'
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        onClick={stopPanelClick}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          zIndex: 201,
          width: `min(${width}px, calc(100vw - 40px))`,
          maxWidth: 'calc(100vw - 40px)',
          background: 'var(--lp-surface)',
          border: `0.5px solid ${danger ? 'rgba(239,68,68,0.3)' : 'var(--lp-border-2)'}`,
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 80px)',
          animation: 'lp-modal-slide-up 0.18s cubic-bezier(0.16,1,0.3,1)'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 20px 14px',
            borderBottom: '0.5px solid var(--lp-border)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12
          }}
        >
          <div>
            <div
              id={titleId}
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: danger ? '#ef4444' : 'var(--lp-text)',
                letterSpacing: '-0.01em'
              }}
            >
              {title}
            </div>

            {subtitle && (
              <div
                id={subtitleId}
                style={{
                  fontSize: 12.5,
                  color: 'var(--lp-text-muted)',
                  marginTop: 3
                }}
              >
                {subtitle}
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            type="button"
            aria-label="Close modal"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '0.5px solid var(--lp-border)',
              color: 'var(--lp-text-muted)',
              borderRadius: 7,
              width: 28,
              height: 28,
              cursor: 'pointer',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.1s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              padding: '12px 20px 16px',
              borderTop: '0.5px solid var(--lp-border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              flexWrap: 'wrap'
            }}
          >
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes lp-modal-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes lp-modal-slide-up {
          from { opacity: 0; transform: translate(-50%,-46%); }
          to { opacity: 1; transform: translate(-50%,-50%); }
        }
      `}</style>
    </>
  )
}