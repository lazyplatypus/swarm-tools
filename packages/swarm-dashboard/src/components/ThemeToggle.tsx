/**
 * Theme toggle for Catppuccin dark/light mode
 * 
 * Switches between catppuccin-mocha (dark) and catppuccin-latte (light)
 * Persists preference to localStorage
 */

import { useEffect, useState } from "react";

type Theme = "catppuccin-mocha" | "catppuccin-latte";

/**
 * Get initial theme from localStorage or system preference
 */
function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "catppuccin-mocha";
  
  const stored = localStorage.getItem("webtui-theme") as Theme | null;
  if (stored) return stored;
  
  // Check system preference
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "catppuccin-mocha" : "catppuccin-latte";
}

/**
 * Theme toggle button - switches between Catppuccin Mocha (dark) and Latte (light)
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    // Apply theme to document
    document.documentElement.setAttribute("data-webtui-theme", theme);
    localStorage.setItem("webtui-theme", theme);
  }, [theme]);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      // Only auto-switch if user hasn't manually set a preference
      if (!localStorage.getItem("webtui-theme")) {
        setTheme(e.matches ? "catppuccin-mocha" : "catppuccin-latte");
      }
    };
    
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const isDark = theme === "catppuccin-mocha";

  return (
    <button
      onClick={() => setTheme(isDark ? "catppuccin-latte" : "catppuccin-mocha")}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        padding: "0.5rem",
        borderRadius: "0.5rem",
        border: "1px solid var(--foreground2)",
        background: "var(--background1)",
        color: "var(--foreground0)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "2.5rem",
        height: "2.5rem",
        fontSize: "1.25rem",
        transition: "background-color 0.2s, border-color 0.2s",
      }}
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}
