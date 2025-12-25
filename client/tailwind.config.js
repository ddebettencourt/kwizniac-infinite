/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Retro game show palette - warm ambers, golds, deep burgundy
        gold: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        burgundy: {
          50: '#fdf2f4',
          100: '#fce7ea',
          200: '#f9d0d9',
          300: '#f4a9b8',
          400: '#ed7a93',
          500: '#e04d6f',
          600: '#cc2d56',
          700: '#ab2146',
          800: '#8f1e3f',
          900: '#7a1d3a',
          950: '#450a1c',
        },
        cream: '#fef7e6',
        charcoal: '#1a1a1a',
      },
      fontFamily: {
        // Display font for headers - bold, game show feel
        display: ['Playfair Display', 'Georgia', 'serif'],
        // Body font - clean, readable
        body: ['Outfit', 'system-ui', 'sans-serif'],
        // Mono for scores/numbers
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      animation: {
        'glow': 'glow 2s ease-in-out infinite alternate',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.4s ease-out',
        'buzz': 'buzz 0.3s ease-in-out',
        'score-pop': 'scorePop 0.5s ease-out',
        'reveal': 'reveal 0.6s ease-out',
        'scanline': 'scanline 8s linear infinite',
        'flicker': 'flicker 0.15s infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(251, 191, 36, 0.4)' },
          '100%': { boxShadow: '0 0 40px rgba(251, 191, 36, 0.8)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(50px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        buzz: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
        scorePop: {
          '0%': { transform: 'scale(0.5)', opacity: '0' },
          '50%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        reveal: {
          '0%': { clipPath: 'inset(0 100% 0 0)' },
          '100%': { clipPath: 'inset(0 0 0 0)' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.98' },
        },
      },
      backgroundImage: {
        'retro-gradient': 'linear-gradient(135deg, #1a1a1a 0%, #2d1f1f 50%, #1a1a1a 100%)',
        'gold-gradient': 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)',
        'spotlight': 'radial-gradient(ellipse at center, rgba(251, 191, 36, 0.1) 0%, transparent 70%)',
      },
    },
  },
  plugins: [],
}
