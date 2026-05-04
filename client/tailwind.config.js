/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#c084fc", // Purple
        secondary: "#00D09C", // Green
        danger: "#ef4444", // Red
        background: "#0f172a", // Dark Blue/Slate
        surface: "#1e293b",
        border: "rgba(255, 255, 255, 0.05)",
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
