import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // 'SplineNum' covers digits only → numbers render in Spline Sans;
        // everything else falls through to Stack Sans Text.
        sans: ['SplineNum', 'Stack Sans Text', 'sans-serif'],
        text: ['Stack Sans Text', 'sans-serif'],
        numbers: ['SplineNum', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "#e8590c",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // App surface + semantic accents (used by card shells & alert banners).
        surface: "#0a0a0a",
        warning: "#dc2626",
        caution: "#facc15",
        info: "#ffffff",
        "brand-yellow": "hsl(var(--brand-yellow))",
      },
      boxShadow: {
        // Signature elevated card shadows (dark + light tiers).
        card: "0 16px 50px -12px rgba(0,0,0,0.9)",
        "card-light": "0 10px 30px -12px rgba(0,0,0,0.18)",
      },
      fontSize: {
        // Fluid type tokens that scale with the viewport between min/max.
        "fluid-xs": "clamp(0.7rem, 1.6vw, 0.8rem)",
        "fluid-sm": "clamp(0.8rem, 2vw, 0.9rem)",
        "fluid-base": "clamp(0.9rem, 2.4vw, 1rem)",
        "fluid-lg": "clamp(1rem, 3vw, 1.25rem)",
        "fluid-xl": "clamp(1.25rem, 4vw, 1.625rem)",
        "fluid-2xl": "clamp(1.5rem, 5vw, 2rem)",
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-100%)' }
        }
      },
      animation: {
        marquee: 'marquee 40s linear infinite'
      }
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;