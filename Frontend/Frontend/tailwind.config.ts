import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#13222f",
        ocean: {
          50: "#eef8fb",
          100: "#d5f0f6",
          500: "#1687a7",
          600: "#126f8a",
          700: "#105972"
        },
        moss: {
          50: "#f0f7f2",
          500: "#2f7d50",
          600: "#236640"
        }
      },
      boxShadow: {
        card: "0 8px 28px rgba(19, 34, 47, 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
