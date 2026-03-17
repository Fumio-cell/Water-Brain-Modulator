/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brain-bg': '#020617',
        'brain-panel': '#0f172a',
        'brain-accent': '#38bdf8',
        'brain-accent-hover': '#7dd3fc',
        'brain-wave': '#818cf8',
        'brain-deep': '#1e1b4b',
      },
      backgroundImage: {
        'water-grid': 'linear-gradient(to right, #ffffff05 1px, transparent 1px), linear-gradient(to bottom, #ffffff05 1px, transparent 1px)',
      },
      animation: {
        'wave-slow': 'wave 20s linear infinite',
      },
      keyframes: {
        wave: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        }
      }
    },
  },
  plugins: [],
}
