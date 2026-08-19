import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        semaphore: {
          blue:  { DEFAULT: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
          green: { DEFAULT: '#059669', bg: 'rgba(5,150,105,0.10)'  },
          amber: { DEFAULT: '#f59e0b', bg: 'rgba(245,158,11,0.10)' },
          red:   { DEFAULT: '#ef4444', bg: 'rgba(239,68,68,0.10)'  }
        },
        lp: {
          bg:      '#f8fafc',
          surface: '#ffffff',
          border:  '#e4e4e7',
          accent:  '#1d4ed8',
          muted:   '#475569'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      borderRadius: {
        lp: '12px'
      }
    }
  },
  plugins: []
}

export default config