import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/providers/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'Menlo', 'monospace'],
      },
      colors: {
        // ── CFE Dental palette ────────────────────────────────────────
        // sidebar navy
        sidebar:        { DEFAULT: '#0F1A2E', active: '#0A7B6E', text: 'rgba(255,255,255,0.65)' },
        // accent teal
        accent:         { DEFAULT: '#0A7B6E', dark: '#075E54', light: '#E6F4F1' },
        // neutral surfaces
        surface:        '#F7F8FA',
        border:         { DEFAULT: '#E5E7EB', strong: '#D1D5DB' },
        // ink (text) scale
        ink:            { DEFAULT: '#111827', secondary: '#374151', muted: '#9CA3AF' },
      },
    },
  },
  plugins: [],
};

export default config;
