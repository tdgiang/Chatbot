/** @type {import('tailwindcss').Config} */
export default {
  // Prefix tất cả class để không đụng CSS của trang host
  prefix: 'cw-',
  content: ['./src/**/*.{ts,tsx}'],
  // important: '#chatbot-widget-root' — tăng specificity để override host CSS
  important: '#chatbot-widget-root',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563eb',
          dark: '#1d4ed8',
          light: '#eff6ff',
        },
      },
      keyframes: {
        fadeIn: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        blink: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0' } },
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        blink: 'blink 1s step-start infinite',
      },
    },
  },
  plugins: [],
};
