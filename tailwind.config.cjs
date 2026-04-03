/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'frc-blue': '#1a8cff',
        'frc-orange': '#ff8800',
      },
      boxShadow: {
        glow: '0 0 24px rgba(26, 140, 255, 0.35)',
      },
    },
  },
  plugins: [],
}
