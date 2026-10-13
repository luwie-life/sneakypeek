/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: 'var(--sp-ink)',
        paper: 'var(--sp-paper)',
        accent: {
          DEFAULT: 'var(--sp-accent)',
          soft: 'var(--sp-accent-soft)',
          dim: 'var(--sp-accent-dim)',
        },
        line: 'var(--sp-line)',
        surface: 'var(--sp-surface)',
        muted: 'var(--sp-muted)',
      },
      fontFamily: {
        sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      borderRadius: {
        xl: 'var(--sp-radius-lg)',
        '2xl': 'var(--sp-radius-xl)',
        pill: '999px',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(20,20,20,0.04), 0 8px 24px rgba(20,20,20,0.06)',
        floating: '0 12px 40px rgba(20,20,20,0.12)',
      },
      backdropBlur: {
        glass: '20px',
      },
    },
  },
  plugins: [],
}
