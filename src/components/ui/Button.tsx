import type {
  ReactNode,
  ButtonHTMLAttributes,
  CSSProperties,
  MouseEvent
} from 'react'

type Variant = 'primary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  children: ReactNode
}

const VARIANT_STYLES: Record<Variant, CSSProperties> = {
  primary: {
    background: 'var(--lp-accent)',
    color: '#fff',
    border: 'none'
  },
  ghost: {
    background: 'rgba(255,255,255,0.06)',
    color: 'var(--lp-text-muted)',
    border: '0.5px solid var(--lp-border)'
  },
  danger: {
    background: 'rgba(239,68,68,0.10)',
    color: '#ef4444',
    border: '0.5px solid rgba(239,68,68,0.3)'
  },
  success: {
    background: 'rgba(34,197,94,0.10)',
    color: '#22c55e',
    border: '0.5px solid rgba(34,197,94,0.3)'
  }
}

const SIZE_STYLES: Record<Size, CSSProperties> = {
  sm: {
    fontSize: 12,
    padding: '5px 11px',
    borderRadius: 7
  },
  md: {
    fontSize: 13,
    padding: '7px 14px',
    borderRadius: 8
  },
  lg: {
    fontSize: 14,
    padding: '10px 20px',
    borderRadius: 9
  }
}

const BASE_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  fontWeight: 500,
  outline: 'none',
  whiteSpace: 'nowrap',
  transition: 'opacity 0.15s, transform 0.1s',
  fontFamily: 'inherit',
  appearance: 'none',
  WebkitAppearance: 'none'
}

const SPINNER_STYLE: CSSProperties = {
  display: 'inline-block',
  width: 12,
  height: 12,
  border: '1.5px solid currentColor',
  borderTopColor: 'transparent',
  borderRadius: '50%',
  animation: 'lp-button-spin 0.6s linear infinite',
  flexShrink: 0
}

function handleMouseEnter(
  e: MouseEvent<HTMLButtonElement>,
  isDisabled: boolean,
  original?: ButtonHTMLAttributes<HTMLButtonElement>['onMouseEnter']
) {
  if (!isDisabled) e.currentTarget.style.opacity = '0.8'
  original?.(e)
}

function handleMouseLeave(
  e: MouseEvent<HTMLButtonElement>,
  isDisabled: boolean,
  original?: ButtonHTMLAttributes<HTMLButtonElement>['onMouseLeave']
) {
  if (!isDisabled) {
    e.currentTarget.style.opacity = '1'
    e.currentTarget.style.transform = 'scale(1)'
  }
  original?.(e)
}

function handleMouseDown(
  e: MouseEvent<HTMLButtonElement>,
  isDisabled: boolean,
  original?: ButtonHTMLAttributes<HTMLButtonElement>['onMouseDown']
) {
  if (!isDisabled) e.currentTarget.style.transform = 'scale(0.98)'
  original?.(e)
}

function handleMouseUp(
  e: MouseEvent<HTMLButtonElement>,
  isDisabled: boolean,
  original?: ButtonHTMLAttributes<HTMLButtonElement>['onMouseUp']
) {
  if (!isDisabled) e.currentTarget.style.transform = 'scale(1)'
  original?.(e)
}

export default function Button({
  variant = 'ghost',
  size = 'md',
  loading = false,
  icon,
  children,
  disabled,
  style,
  type,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onMouseUp,
  ...rest
}: ButtonProps) {
  const isDisabled = Boolean(disabled || loading)

  return (
    <>
      <button
        {...rest}
        type={type ?? 'button'}
        disabled={isDisabled}
        style={{
          ...BASE_STYLE,
          ...VARIANT_STYLES[variant],
          ...SIZE_STYLES[size],
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.45 : 1,
          ...style
        }}
        onMouseEnter={e => handleMouseEnter(e, isDisabled, onMouseEnter)}
        onMouseLeave={e => handleMouseLeave(e, isDisabled, onMouseLeave)}
        onMouseDown={e => handleMouseDown(e, isDisabled, onMouseDown)}
        onMouseUp={e => handleMouseUp(e, isDisabled, onMouseUp)}
      >
        {loading ? <span style={SPINNER_STYLE} aria-hidden="true" /> : icon}
        {children}
      </button>

      <style>{`
        @keyframes lp-button-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}