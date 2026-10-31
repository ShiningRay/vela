import { createSignal } from "solid-js";
import type { Vfs } from "@vela/core";
import { Button, Input, Label, List, Row, Stack, StatusBar, Textarea } from "@vela/ui";
import { useDesktop } from "../context";

function collectFiles(vfs: Vfs, dir: string, depth = 0): string[] {
  if (depth > 2) return [];
  try {
    return vfs.list(dir).flatMap((entry) => {
      if (entry.kind === "file") return [entry.path];
      return collectFiles(vfs, entry.path, depth + 1);
    });
  } catch {
    return [];
  }
}

export function EditorApp() {
  const { vfs, notifications } = useDesktop();
  const [path, setPath] = createSignal("/Documents/welcome.md");
  const [draft, setDraft] = createSignal("");
  const [status, setStatus] = createSignal("Ready");
  const [revision, setRevision] = createSignal(0);

  const files = () => {
    revision();
    return collectFiles(vfs, "/");
  };

  const load = (next = path()) => {
    try {
      const content = vfs.read(next);
      setPath(next);
      setDraft(content.startsWith("data:") ? "" : content);
      setStatus("Loaded");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const save = () => {
    try {
      vfs.write(path(), draft());
      void vfs.flush?.();
      setStatus("Saved");
      setRevision((value) => value + 1);
      notifications.push("Editor", `Saved ${path()}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  load();

  return (
    <Stack gap={12}>
      <Row gap={8}>
        <Input
          aria-label="File path"
          value={path()}
          onInput={(event) => setPath(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") load();
          }}
        />
        <Button variant="ghost" onClick={() => load()}>
          Open
        </Button>
        <Button variant="primary" onClick={save}>
          Save
        </Button>
      </Row>

      <Textarea
        aria-label="Editor content"
        class="vela-editor__content"
        value={draft()}
        onInput={(event) => setDraft(event.currentTarget.value)}
      />

      <Stack gap={6}>
        <Label>Files</Label>
        <List
          label="Editor files"
          selectedId={path()}
          onSelect={(id) => load(id)}
          items={files().map((file) => ({ id: file, label: file, icon: "·" }))}
          empty="No files"
        />
      </Stack>

      <StatusBar
        items={[
          { id: "path", label: "Path", value: path() },
          { id: "status", label: "Status", value: status() },
        ]}
      />
    </Stack>
  );
}
