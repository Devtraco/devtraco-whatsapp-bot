/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Devtraco brand — Gold + Navy
        brand: {
          50:  "#fdf8ed",
          100: "#f8ecc7",
          200: "#f1d68e",
          300: "#e8bc50",
          400: "#dda52a",
          500: "#c9920e",
          600: "#b07c0a",   // primary gold — dark enough for white text
          700: "#8a5f08",
          800: "#6b4906",
          900: "#4f3404",
        },
        gold: {
          light: "#f8ecc7",
          DEFAULT: "#c9920e",
          dark:  "#8a5f08",
        },
        navy: {
          700: "#1e3a5f",
          800: "#162d4f",
          900: "#0a1f3d",   // Devtraco deep navy
          950: "#061428",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card:    "0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)",
        "card-md": "0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.04)",
      },
    },
  },
  plugins: [],
};
