import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0a0b12',
          900: '#0f111a',
          850: '#141725',
          800: '#1a1e30',
          700: '#262b42',
          600: '#373d5c',
        },
        brand: {
          400: '#5eead4',
          500: '#22d3a7',
          600: '#0fb98e',
        },
        accent: '#8b5cf6',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
