import { createSignal } from "solid-js";
import { applyTheme, tokens } from "@vela/theme";
import { Button, Label, Row, Stack } from "@vela/ui";

const accents = ["#7dd3fc", "#a78bfa", "#f472b6", "#4ade80", "#fbbf24"] as const;

export function SettingsApp() {
  const [accent, setAccent] = createSignal<string>(tokens.color.accent);

  const choose = (color: string) => {
    setAccent(color);
    applyTheme(document.documentElement, { accent: color });
  };

  return (
    <Stack gap={16}>
      <Stack gap={6}>
        <Label>Accent</Label>
        <Row gap={8}>
          {accents.map((color) => (
            <button
              type="button"
              class="vela-swatch"
              data-active={accent() === color ? "true" : "false"}
              style={{ background: color }}
              aria-label={`Use accent ${color}`}
              onClick={() => choose(color)}
            />
          ))}
        </Row>
      </Stack>

      <Stack gap={6}>
        <Label>Design tokens</Label>
        <Row gap={8}>
          <span class="vela-token-chip" style={{ background: tokens.color.bg }}>bg</span>
          <span class="vela-token-chip" style={{ background: tokens.color.surface }}>surface</span>
          <span class="vela-token-chip" style={{ background: tokens.color.accent }}>accent</span>
        </Row>
      </Stack>

      <Button variant="ghost" onClick={() => applyTheme(document.documentElement)}>
        Reset theme
      </Button>
    </Stack>
  );
}
