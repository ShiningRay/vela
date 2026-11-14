import { createMemo, onCleanup, Show, type JSX } from "solid-js";
import type { AppDefinition, AppRegistry, Vfs } from "@vela/core";
import {
  listInstalledPackages,
  packageDocument,
  readInstalledPackage,
  type VpkManifest,
} from "@vela/vpk";
import { Label } from "@vela/ui";
import { useDesktop } from "./context";

export {
  installPackage,
  listInstalledPackages,
  parseManifest,
  parseVpk,
  readInstalledPackage,
  uninstallPackage,
} from "@vela/vpk";
export type { VpkManifest, VpkPackage } from "@vela/vpk";

export function PackageApp(props: { packageId: string }): JSX.Element {
  const { vfs } = useDesktop();
  const document = createMemo(() => {
    const pkg = readInstalledPackage(vfs, props.packageId);
    return pkg ? packageDocument(pkg) : null;
  });
  onCleanup(() => document()?.revoke());

  return (
    <Show
      when={document()}
      fallback={<Label muted>This app package is not installed.</Label>}
    >
      {(content) => (
        <iframe
          class="vela-package-frame"
          title={props.packageId}
          sandbox="allow-scripts"
          srcdoc={content().html}
        />
      )}
    </Show>
  );
}

export function registerPackageApp(apps: AppRegistry, manifest: VpkManifest): void {
  if (apps.find(manifest.id)) apps.unregister(manifest.id);
  const app: AppDefinition = {
    id: manifest.id,
    title: manifest.name,
    icon: manifest.icon ?? "▣",
    component: () => <PackageApp packageId={manifest.id} />,
    ...(manifest.window ? { defaultGeometry: manifest.window } : {}),
  };
  apps.register(app);
}

export function registerInstalledPackages(apps: AppRegistry, vfs: Vfs): void {
  for (const pkg of listInstalledPackages(vfs)) {
    if (!apps.find(pkg.manifest.id)) registerPackageApp(apps, pkg.manifest);
  }
}
