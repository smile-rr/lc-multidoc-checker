/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        slate2:  '#f5f5f7',
        paper:   '#ffffff',
        line:    '#d1d1d6',
        muted:   '#6e6e73',
        navy:    { 1: '#1d1d1f', 2: '#142236' },
        teal:    { 1: '#0a7e6a', 2: '#0e9e86' },
        status: {
          red:       '#cc0011',
          redSoft:   '#fff1f0',
          green:     '#1a7a43',
          greenSoft: '#f0fdf4',
          gold:      '#8a5700',
          goldSoft:  '#fefce8',
          blue:      '#0066cc',
          blueSoft:  '#eff6ff',
        },
      },
    },
  },
  plugins: [],
};
