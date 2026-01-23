import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Neo-brutalist palette
        'neo-bg': '#FFFDF5', // Cream background
        'neo-foreground': '#000000', // Pure black
        'neo-accent': '#FF6B6B', // Hot Red
        'neo-secondary': '#FFD93D', // Vivid Yellow
        'neo-muted': '#C4B5FD', // Soft Violet
        'neo-white': '#FFFFFF', // White for contrast
        // Legacy support (will be replaced)
        background: '#FFFDF5',
        foreground: '#000000',
      },
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
      },
      fontWeight: {
        black: '900',
        bold: '700',
        medium: '500',
      },
      boxShadow: {
        'neo-sm': '4px 4px 0px 0px #000',
        'neo-md': '8px 8px 0px 0px #000',
        'neo-lg': '12px 12px 0px 0px #000',
        'neo-xl': '16px 16px 0px 0px #000',
        'neo-2xl': '20px 20px 0px 0px #000',
        'neo-white-sm': '4px 4px 0px 0px #fff',
        'neo-white-md': '8px 8px 0px 0px #fff',
        'neo-white-lg': '12px 12px 0px 0px #fff',
      },
      textShadow: {
        'neo-sm': '4px 4px 0px #000',
        'neo-md': '6px 6px 0px #000',
        'neo-lg': '8px 8px 0px #000',
      },
      borderRadius: {
        none: '0px',
      },
      letterSpacing: {
        tighter: '-0.05em',
        widest: '0.2em',
      },
      animation: {
        'spin-slow': 'spin 10s linear infinite',
        'marquee': 'marquee 20s linear infinite',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [
    function ({ addUtilities }: { addUtilities: any }) {
      addUtilities({
        '.text-stroke': {
          '-webkit-text-stroke': '2px #000',
          'color': 'transparent',
        },
        '.text-stroke-thin': {
          '-webkit-text-stroke': '1px #000',
          'color': 'transparent',
        },
      });
    },
  ],
};

export default config;
