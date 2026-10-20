import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const hsl = (v: string) => `hsl(var(${v}) / <alpha-value>)`
const sans = ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif']

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      // One typeface everywhere, as in a standard Figma UI kit.
      fontFamily: { display: sans, sans },
      colors: {
        border: hsl('--border'),
        input: hsl('--input'),
        ring: hsl('--ring'),
        background: hsl('--background'),
        foreground: hsl('--foreground'),
        surface: hsl('--surface'),
        primary: { DEFAULT: hsl('--primary'), foreground: hsl('--primary-foreground'), soft: hsl('--primary-soft') },
        brand: { DEFAULT: hsl('--brand'), soft: hsl('--brand-soft') },
        accent: { DEFAULT: hsl('--accent'), foreground: hsl('--accent-foreground'), soft: hsl('--accent-soft') },
        muted: { DEFAULT: hsl('--muted'), foreground: hsl('--muted-foreground') },
        soil: { DEFAULT: hsl('--soil'), soft: hsl('--soil-soft') },
        destructive: { DEFAULT: hsl('--destructive'), foreground: hsl('--destructive-foreground'), soft: hsl('--destructive-soft') },
        warning: { DEFAULT: hsl('--warning'), soft: hsl('--warning-soft') },
        success: { DEFAULT: hsl('--success'), soft: hsl('--success-soft') },
        info: { DEFAULT: hsl('--info'), soft: hsl('--info-soft') },
        poultry: { DEFAULT: hsl('--poultry'), soft: hsl('--poultry-soft'), ink: hsl('--poultry-ink') },
        fish: { DEFAULT: hsl('--fish'), soft: hsl('--fish-soft'), ink: hsl('--fish-ink') },
        crop: { DEFAULT: hsl('--crop'), soft: hsl('--crop-soft'), ink: hsl('--crop-ink') },
        money: { in: hsl('--money-in'), out: hsl('--money-out') },
        canopy: { DEFAULT: hsl('--canopy'), deep: hsl('--canopy-deep'), line: hsl('--canopy-line') },
      },
      borderRadius: { xl: '0.875rem', lg: '0.625rem', md: '0.5rem', sm: '0.375rem' },
      boxShadow: {
        card: '0 1px 2px rgb(16 24 40 / 0.04)',
        raised: '0 8px 24px -6px rgb(16 24 40 / 0.12), 0 2px 6px -2px rgb(16 24 40 / 0.06)',
        pill: '0 1px 2px rgb(16 24 40 / 0.06), 0 0 0 1px rgb(16 24 40 / 0.06)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        rise: { from: { opacity: '0', transform: 'translateY(14px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slow-zoom': { from: { transform: 'scale(1.06)' }, to: { transform: 'scale(1)' } },
      },
      animation: {
        'slow-zoom': 'slow-zoom 14s ease-out both',
        'fade-in': 'fade-in 150ms ease-out',
        rise: 'rise 700ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [animate],
} satisfies Config
