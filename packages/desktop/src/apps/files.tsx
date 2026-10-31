import { createSignal, For, Show } from "solid-js";
import { Button, Label, Row, Stack } from "@vela/ui";
import { useDesktop } from "../context";

export function FilesApp() {
  const { vfs } = useDesktop();
  const [path, setPath] = createSignal("/Documents");
  const [revision, setRevision] = createSignal(0);
  const [preview, setPreview] = createSignal<string | null>(null);

  const entries = () => {
    revision();
    try {
      return vfs.list(path());
    } catch {
      return [];
    }
  };

  const open = (entryPath: string, kind: "file" | "dir") => {
    if (kind === "dir") {
      setPath(entryPath);
      setPreview(null);
      return;
    }
    try {
      setPreview(vfs.read(entryPath));
    } catch (error) {
      setPreview(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Stack gap={12}>
      <Row gap={8}>
        <Button variant="ghost" onClick={() => setPath("/")}>
          /
        </Button>
        <Label muted>{path()}</Label>
        <Button variant="ghost" onClick={() => setRevision((value) => value + 1)}>
          Refresh
        </Button>
      </Row>

      <div class="vela-file-list">
        <Show when={entries().length > 0} fallback={<Label muted>Empty folder</Label>}>
          <For each={entries()}>
            {(entry) => (
              <button
                type="button"
                class="vela-file-row"
                onClick={() => open(entry.path, entry.kind)}
              >
                <span class="vela-file-row__icon" aria-hidden="true">
                  {entry.kind === "dir" ? "▸" : "·"}
                </span>
                <span>{entry.name}</span>
                <span class="vela-file-row__kind">{entry.kind}</span>
              </button>
            )}
          </For>
        </Show>
      </div>

      <Show when={preview() !== null}>
        <pre class="vela-file-preview">{preview()}</pre>
      </Show>
    </Stack>
  );
}
