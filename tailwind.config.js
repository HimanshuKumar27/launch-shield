/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.html",
    "./public/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        // Brand
        primary: {
          50:  '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        // Score bands (consistent everywhere)
        score: {
          good:    '#10b981', // emerald-500
          warning: '#f59e0b', // amber-500
          poor:    '#ef4444', // red-500
        },
        // Dark theme surfaces
        dark: {
          950: '#030712',
          900: '#111827',
          800: '#1f2937',
          700: '#374151',
          600: '#4b5563',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      backdropBlur: {
        xs: '2px',
        '2xl': '40px',
        '3xl': '64px',
      },
      animation: {
        'pulse-slow':   'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':      'fadeIn 0.5s ease-out',
        'slide-up':     'slideUp 0.4s ease-out',
        'slide-in-right': 'slideInRight 0.35s ease-out',
        'spin-slow':    'spin 3s linear infinite',
        'float':        'float 6s ease-in-out infinite',
        'float-delayed':'float 6s ease-in-out 2s infinite',
        'float-slow':   'float 8s ease-in-out 1s infinite',
        'glow-pulse':   'glowPulse 2.5s ease-in-out infinite',
        'neon-sweep':   'neonSweep 2s linear infinite',
        'laser':        'laser 2s ease-in-out infinite',
        'count-up':     'countUp 0.6s ease-out forwards',
        'pop-in':       'popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'draw-line':    'drawLine 1s ease-out forwards',
        'slide-in-left':'slideInLeft 0.4s ease-out',
        'stagger-1':    'slideUp 0.4s ease-out 0.05s both',
        'stagger-2':    'slideUp 0.4s ease-out 0.10s both',
        'stagger-3':    'slideUp 0.4s ease-out 0.15s both',
        'stagger-4':    'slideUp 0.4s ease-out 0.20s both',
        'stagger-5':    'slideUp 0.4s ease-out 0.25s both',
        'stagger-6':    'slideUp 0.4s ease-out 0.30s both',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%':   { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInLeft: {
          '0%':   { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-12px)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%':      { opacity: '1',   transform: 'scale(1.05)' },
        },
        neonSweep: {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        laser: {
          '0%':   { transform: 'translateY(-4px)', opacity: '0' },
          '10%':  { opacity: '1' },
          '90%':  { opacity: '1' },
          '100%': { transform: 'translateY(100%)', opacity: '0' },
        },
        popIn: {
          '0%':   { opacity: '0', transform: 'scale(0)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        drawLine: {
          '0%':   { width: '0%' },
          '100%': { width: '100%' },
        },
        countUp: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      boxShadow: {
        'glow':          '0 0 30px rgba(13, 148, 136, 0.3)',
        'glow-lg':       '0 0 60px rgba(13, 148, 136, 0.2)',
        'glow-teal-xl':  '0 0 80px rgba(13, 148, 136, 0.4), 0 0 30px rgba(13, 148, 136, 0.2)',
        'glow-emerald':  '0 0 40px rgba(16, 185, 129, 0.35)',
        'glow-amber':    '0 0 40px rgba(245, 158, 11, 0.35)',
        'glow-red':      '0 0 40px rgba(239, 68, 68, 0.35)',
        'card':          '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
        'glass':         '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        'glass-hover':   '0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
        'neon-teal':     '0 0 10px rgba(20, 184, 166, 0.8), 0 0 40px rgba(20, 184, 166, 0.3)',
      },
    },
  },
  plugins: [],
}
