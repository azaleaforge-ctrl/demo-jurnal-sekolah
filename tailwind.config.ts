import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Sora", "Plus Jakarta Sans", "system-ui", "sans-serif"],
        sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#101828",
        paper: "#F6F7FB",
        brand: {
          50: "#eef4ff", 100: "#dfe9ff", 500: "#2E5BFF", 600: "#1E40D6", 700: "#1733ac", 900: "#0f1f5c"
        },
        accent: { 400: "#F5B83D", 500: "#EFA00B" },
      },
      boxShadow: { soft: "0 12px 40px -12px rgba(16,24,40,.18)", pop: "0 8px 24px -8px rgba(46,91,255,.45)" },
      keyframes: { shake: { "0%,100%": { transform: "translateX(0)" }, "20%": { transform: "translateX(-8px)" }, "40%": { transform: "translateX(8px)" }, "60%": { transform: "translateX(-5px)" }, "80%": { transform: "translateX(5px)" } } },
      animation: { shake: "shake .45s ease-in-out" },
    },
  },
  plugins: [],
};
export default config;
