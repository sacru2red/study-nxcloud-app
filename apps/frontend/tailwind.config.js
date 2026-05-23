const { createGlobPatternsForDependencies } = require('@nx/react/tailwind')
const { join } = require('path')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    join(__dirname, '{src,pages,components,app}/**/!(*.stories|*.spec).{ts,tsx,html}'),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'oklch(61.5% 0.210 25.2)',
          bright: 'oklch(73.5% 0.200 25.2)',
          deep: 'oklch(49.5% 0.179 27.2)',
          soft: 'oklch(92.0% 0.032 25.2)',
          ghost: 'oklch(96.5% 0.012 25.2)',
        },
        ink: {
          DEFAULT: 'oklch(21.8% 0 0)',
          deep: 'oklch(0% 0 0)',
          soft: 'oklch(28.1% 0 0)',
        },
        canvas: 'oklch(100% 0 0)',
        cloud: 'oklch(97.6% 0.004 25.2)',
        fog: 'oklch(93.1% 0.006 25.2)',
        steel: 'oklch(81.4% 0.008 25.2)',
        charcoal: 'oklch(36.0% 0 0)',
        graphite: 'oklch(50.0% 0 0)',
        accent: {
          sale: {
            DEFAULT: 'oklch(78.0% 0.160 65.0)',
            soft: 'oklch(94.0% 0.045 65.0)',
          },
        },
        error: {
          DEFAULT: 'oklch(48.0% 0.170 22.0)',
          deep: 'oklch(32.0% 0.110 22.0)',
        },
        storm: {
          mist: 'oklch(77.1% 0.055 222.2)',
          sea: 'oklch(72.1% 0.055 222.8)',
          deep: 'oklch(47.4% 0.055 222.8)',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
