/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,html}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      // Every colour resolves to a CSS custom property so light/dark are both
      // first-class and switchable without a re-render. See DESIGN.md.
      colors: {
        ink: 'var(--ink)',
        muted: 'var(--ink-muted)',
        faint: 'var(--ink-faint)',
        paper: 'var(--paper)',
        card: 'var(--card)',
        rule: 'var(--rule)',
        ledger: 'var(--ledger)',
        'ledger-soft': 'var(--ledger-soft)',
        good: 'var(--state-good)',
        warn: 'var(--state-warn)',
        bad: 'var(--state-bad)',
        'good-soft': 'var(--state-good-soft)',
        'warn-soft': 'var(--state-warn-soft)',
        'bad-soft': 'var(--state-bad-soft)',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Every number in the product is set in this face. See DESIGN.md.
        num: ['ui-monospace', 'SF Mono', 'JetBrains Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs: ['11px', '15px'],
        sm: ['12px', '16px'],
        base: ['13px', '18px'],
        md: ['14px', '20px'],
      },
      spacing: { row: '28px' },
      transitionDuration: { DEFAULT: '150ms' },
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(0, 0, 0.2, 1)' },
    },
  },
  plugins: [],
};
