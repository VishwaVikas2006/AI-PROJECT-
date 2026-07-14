/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  corePlugins: {
    // Keep existing app pages (Login/Dashboard/etc.) visually intact — they use
    // hand-written CSS, so we disable Tailwind's preflight resets.
    preflight: false,
  },
  theme: {
    extend: {
      fontFamily: {
        inter: ['Inter', 'system-ui', 'sans-serif'],
        jakarta: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      colors: {
        brand: '#5ed29c',
        ink: '#070b0a',
      },
    },
  },
  plugins: [],
};
