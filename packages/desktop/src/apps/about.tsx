import { Label, Row, Stack } from "@vela/ui";

export function AboutApp() {
  return (
    <Stack gap={14}>
      <Stack gap={4}>
        <strong style={{ "font-size": "20px", "letter-spacing": "0.04em" }}>Vela</strong>
        <Label muted>A Solid + TypeScript desktop platform.</Label>
      </Stack>

      <Stack gap={6}>
        <Row gap={8}>
          <Label muted>Runtime</Label>
          <Label>Solid 1.9</Label>
        </Row>
        <Row gap={8}>
          <Label muted>Shell</Label>
          <Label>Tauri 2</Label>
        </Row>
        <Row gap={8}>
          <Label muted>Packages</Label>
          <Label>@vela/core · @vela/ui · @vela/desktop</Label>
        </Row>
      </Stack>

      <Label muted>
        The architecture follows Citrine's lessons — signals, block-level updates,
        window manager as a service — but the runtime is Solid and the compiler is Vite,
        not Opal.
      </Label>
    </Stack>
  );
}
