/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pitch: {
          950: '#060f0a',
          900: '#0a1810',
          800: '#0f2417',
          700: '#16331f',
          600: '#1e4228',
        },
        surface: {
          950: '#0b0f14',
          900: '#10161d',
          800: '#161e28',
          700: '#1f2a38',
          600: '#2a3a4d',
        },
        accent: {
          DEFAULT: '#3ddc84',
          300: '#7ff0b0',
          400: '#5ce79a',
          500: '#3ddc84',
          600: '#26b86a',
        },
        gold: {
          DEFAULT: '#f5b942',
          400: '#f8c96a',
          600: '#d99a24',
        },
      },
      fontFamily: {
        display: ['"Sora"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(61,220,132,0.25)',
        card: '0 4px 24px rgba(0,0,0,0.35)',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 12px rgba(61,220,132,0.15)' },
          '50%': { boxShadow: '0 0 28px rgba(61,220,132,0.45)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        spinSlow: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 0.4s ease-out both',
        fadeIn: 'fadeIn 0.3s ease-out both',
        pulseGlow: 'pulseGlow 2.4s ease-in-out infinite',
        slideIn: 'slideIn 0.25s ease-out both',
        spinSlow: 'spinSlow 14s linear infinite',
      },
    },
  },
  plugins: [],
};
