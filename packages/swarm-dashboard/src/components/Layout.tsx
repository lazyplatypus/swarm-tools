/**
 * Responsive grid layout container for swarm dashboard
 * 
 * Mobile: stacks panes vertically
 * Desktop: 3-column grid (agents | events | cells)
 * 
 * Uses WebTUI + Catppuccin theme variables for consistent styling
 */

import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";

interface LayoutProps {
  children: ReactNode;
}

/**
 * Main layout grid - responsive 3-pane dashboard
 * 
 * Breakpoints:
 * - Mobile (<768px): vertical stack
 * - Tablet (768-1024px): 2-column, cells full width below
 * - Desktop (>1024px): 3-column grid
 */
export function Layout({ children }: LayoutProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--background0)",
        color: "var(--foreground0)",
      }}
    >
      {/* Header with title and theme toggle */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1rem 1.5rem",
          borderBottom: "1px solid var(--surface0, #313244)",
          backgroundColor: "var(--background1)",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "1.5rem",
            fontWeight: 600,
            color: "var(--foreground0)",
            fontFamily: "inherit",
          }}
        >
          🐝 Swarm Dashboard
        </h1>
        <ThemeToggle />
      </header>

      {/* Main content grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6 h-[calc(100vh-80px)]">
        {children}
      </div>
    </div>
  );
}

interface PaneProps {
  children: ReactNode;
  className?: string;
}

/**
 * Individual pane container with WebTUI theme styling
 */
export function Pane({ children, className = "" }: PaneProps) {
  return (
    <div
      className={className}
      style={{
        backgroundColor: "var(--background1)",
        borderRadius: "0.5rem",
        border: "1px solid var(--surface0, #313244)",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}
