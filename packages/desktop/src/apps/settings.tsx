import { createSignal, For } from "solid-js";
import {
  Button,
  ColorPicker,
  FilePickerButton,
  Input,
  Label,
  List,
  Row,
  Select,
  Stack,
  Tag,
} from "@vela/ui";
import { useDesktop } from "../context";
import { installPackage, listInstalledPackages, parseVpk, registerPackageApp } from "../packages";
import { HOTKEY_ACTIONS, WALLPAPERS } from "../settings";
import type { WallpaperId } from "../settings";

const accents = ["#7dd3fc", "#a78bfa", "#f472b6", "#4ade80", "#fbbf24"] as const;

export function SettingsApp() {
  const { apps, notifications, settings, vfs } = useDesktop();
  const [packages, setPackages] = createSignal(listInstalledPackages(vfs));
  const current = () => settings.settings;

  const notify = () => {
    notifications.push("Settings", "This notification dismisses itself after a few seconds.");
  };

  const install = async (files: FileList) => {
    const file = files[0];
    if (!file) return;
    try {
      const pkg = parseVpk(await file.arrayBuffer());
      installPackage(vfs, pkg);
      await vfs.flush?.();
      registerPackageApp(apps, pkg.manifest);
      setPackages(listInstalledPackages(vfs));
      notifications.push("Package installed", `${pkg.manifest.name} ${pkg.manifest.version}`);
    } catch (error) {
      notifications.push("Install failed", error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Stack gap={16}>
      <ColorPicker
        label="Accent"
        value={current().accent}
        swatches={[...accents]}
        onChange={(accent) => settings.update({ accent })}
      />

      <Select
        label="Wallpaper"
        value={current().wallpaper}
        options={Object.keys(WALLPAPERS).map((id) => ({
          value: id,
          label: id[0]!.toUpperCase() + id.slice(1),
        }))}
        onChange={(wallpaper) => settings.update({ wallpaper: wallpaper as WallpaperId })}
      />

      <Stack gap={6}>
        <Label>Marketplace URL</Label>
        <Input
          aria-label="Marketplace URL"
          value={current().marketplaceUrl}
          onChange={(event) => settings.update({ marketplaceUrl: event.currentTarget.value })}
        />
      </Stack>

      <Stack gap={8}>
        <Label>Shortcuts</Label>
        <For each={HOTKEY_ACTIONS}>
          {(action) => (
            <Row gap={8}>
              <Label muted>{action.label}</Label>
              <Input
                aria-label={action.label}
                value={current().hotkeys[action.id]}
                onInput={(event) => settings.setHotkey(action.id, event.currentTarget.value)}
              />
            </Row>
          )}
        </For>
      </Stack>

      <Stack gap={6}>
        <Label>App packages</Label>
        <Row gap={8}>
          <FilePickerButton
            label="Install .vpk"
            accept=".vpk,application/zip"
            onFiles={(files) => void install(files)}
          />
        </Row>
        <List
          label="Installed packages"
          items={packages().map((pkg) => ({
            id: pkg.manifest.id,
            label: `${pkg.manifest.name} ${pkg.manifest.version}`,
            icon: pkg.manifest.icon ?? "▣",
            meta: "vpk",
          }))}
          empty="No packages installed"
        />
      </Stack>

      <Stack gap={6}>
        <Label>Design tokens</Label>
        <Row gap={8}>
          <Tag tone="accent">bg</Tag>
          <Tag tone="neutral">surface</Tag>
          <Tag tone="success">accent</Tag>
        </Row>
      </Stack>

      <Row gap={8}>
        <Button variant="ghost" onClick={() => settings.reset()}>
          Reset settings
        </Button>
        <Button onClick={notify}>Test notification</Button>
      </Row>
    </Stack>
  );
}
