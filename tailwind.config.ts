import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        panel: '#111827',
        panelAlt: '#0f172a',
        border: '#1f2937',
        accent: '#22c55e',
      },
    },
  },
  plugins: [],
} satisfies Config;
