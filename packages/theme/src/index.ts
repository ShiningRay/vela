export const tokens = {
  color: {
    bg: "#0f172a",
    surface: "#172033",
    surfaceRaised: "#1e293b",
    text: "#e2e8f0",
    muted: "#94a3b8",
    accent: "#7dd3fc",
    accentStrong: "#38bdf8",
    border: "#334155",
    danger: "#f87171",
    success: "#4ade80",
  },
  radius: {
    sm: "6px",
    md: "10px",
    lg: "16px",
    pill: "999px",
  },
  space: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "24px",
    6: "32px",
  },
  font: {
    sans: 'Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  },
  shadow: {
    window: "0 24px 64px rgba(2, 6, 23, 0.55)",
    panel: "0 8px 24px rgba(2, 6, 23, 0.35)",
  },
} as const;

export type ThemeMode = "light" | "dark";

export interface ThemeOverrides {
  accent?: string;
  wallpaper?: string;
}

const cssVariables: Record<string, string> = {
  "--vela-color-bg": tokens.color.bg,
  "--vela-color-surface": tokens.color.surface,
  "--vela-color-surface-raised": tokens.color.surfaceRaised,
  "--vela-color-text": tokens.color.text,
  "--vela-color-muted": tokens.color.muted,
  "--vela-color-accent": tokens.color.accent,
  "--vela-color-accent-strong": tokens.color.accentStrong,
  "--vela-color-border": tokens.color.border,
  "--vela-color-danger": tokens.color.danger,
  "--vela-color-success": tokens.color.success,
  "--vela-radius-sm": tokens.radius.sm,
  "--vela-radius-md": tokens.radius.md,
  "--vela-radius-lg": tokens.radius.lg,
  "--vela-radius-pill": tokens.radius.pill,
  "--vela-space-1": tokens.space[1],
  "--vela-space-2": tokens.space[2],
  "--vela-space-3": tokens.space[3],
  "--vela-space-4": tokens.space[4],
  "--vela-space-5": tokens.space[5],
  "--vela-space-6": tokens.space[6],
  "--vela-font-sans": tokens.font.sans,
  "--vela-font-mono": tokens.font.mono,
  "--vela-shadow-window": tokens.shadow.window,
  "--vela-shadow-panel": tokens.shadow.panel,
};

/**
 * Apply the token set as CSS custom properties.
 * Components consume `var(--vela-...)`; JS reads the same values from `tokens`.
 */
export function applyTheme(
  target: HTMLElement = document.documentElement,
  overrides: ThemeOverrides = {},
): void {
  for (const [name, value] of Object.entries(cssVariables)) {
    target.style.setProperty(name, value);
  }
  if (overrides.accent) target.style.setProperty("--vela-color-accent", overrides.accent);
  if (overrides.wallpaper) target.style.setProperty("--vela-wallpaper", overrides.wallpaper);
}

export function resetTheme(target: HTMLElement = document.documentElement): void {
  for (const name of Object.keys(cssVariables)) {
    target.style.removeProperty(name);
  }
  target.style.removeProperty("--vela-wallpaper");
}
