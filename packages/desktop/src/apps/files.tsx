import { createSignal, Show } from "solid-js";
import {
  Breadcrumb,
  Button,
  Confirm,
  Dialog,
  FilePickerButton,
  Input,
  Label,
  List,
  Row,
  Stack,
} from "@vela/ui";
import type { BreadcrumbItem } from "@vela/ui";
import { useDesktop } from "../context";

const TEXT_FILE = /\.(md|txt|json|js|mjs|cjs|ts|tsx|jsx|css|html|xml|csv|ya?ml|toml|sh|env)$/i;

function safeName(name: string): string | null {
  const base = name.split(/[\\/]/).pop()?.trim();
  if (!base || base === "." || base === "..") return null;
  return base;
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header = "", body = ""] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? "application/octet-stream";
  const binary = atob(body);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function FilesApp() {
  const { vfs, notifications } = useDesktop();
  const [path, setPath] = createSignal("/Documents");
  const [revision, setRevision] = createSignal(0);
  const [preview, setPreview] = createSignal<string | null>(null);
  const [selected, setSelected] = createSignal<string | null>(null);
  const [createOpen, setCreateOpen] = createSignal(false);
  const [createKind, setCreateKind] = createSignal<"file" | "dir">("file");
  const [draftName, setDraftName] = createSignal("");
  const [deleteOpen, setDeleteOpen] = createSignal(false);

  const entries = () => {
    revision();
    try {
      return vfs.list(path());
    } catch {
      return [];
    }
  };

  const selectedEntry = () => entries().find((entry) => entry.path === selected());

  const refresh = (): void => {
    setRevision((value) => value + 1);
  };

  const open = (entryPath: string, kind: "file" | "dir") => {
    if (kind === "dir") {
      setPath(entryPath);
      setPreview(null);
      setSelected(null);
      return;
    }
    setSelected(entryPath);
    try {
      const content = vfs.read(entryPath);
      setPreview(content.startsWith("data:") ? `[binary file] ${entryPath}` : content);
    } catch (error) {
      setPreview(error instanceof Error ? error.message : String(error));
    }
  };

  const openById = (id: string) => {
    const entry = entries().find((candidate) => candidate.path === id);
    if (entry) open(entry.path, entry.kind);
  };

  const items = () =>
    entries().map((entry) => ({
      id: entry.path,
      label: entry.name,
      icon: entry.kind === "dir" ? "▸" : "·",
      meta: entry.kind,
    }));

  const breadcrumbs = (): BreadcrumbItem[] => {
    const parts = path().split("/").filter(Boolean);
    const items: BreadcrumbItem[] = [
      {
        id: "root",
        label: "/",
        onClick:
          path() === "/"
            ? undefined
            : () => {
                setPath("/");
              },
      },
    ];
    let current = "";
    for (const part of parts) {
      current += `/${part}`;
      items.push({
        id: current,
        label: part,
        onClick:
          current === path()
            ? undefined
            : () => {
                setPath(current);
              },
      });
    }
    return items;
  };

  const importFiles = async (files: FileList) => {
    let imported = 0;
    for (const file of files) {
      const name = safeName(file.name);
      if (!name) continue;
      const target = `${path()}/${name}`;
      try {
        const content =
          TEXT_FILE.test(name) || file.type.startsWith("text/")
            ? await file.text()
            : await readDataUrl(file);
        vfs.write(target, content);
        imported += 1;
        setSelected(target);
        setPreview(content.startsWith("data:") ? `[binary file] ${target}` : content);
      } catch (error) {
        notifications.push("Import failed", error instanceof Error ? error.message : String(error));
      }
    }
    refresh();
    if (imported > 0) {
      await vfs.flush?.();
      notifications.push("Files imported", `${imported} file(s) added to ${path()}.`);
    }
  };

  const exportSelected = () => {
    const entry = selectedEntry();
    if (!entry || entry.kind !== "file") return;
    try {
      const content = vfs.read(entry.path);
      const blob = content.startsWith("data:")
        ? dataUrlToBlob(content)
        : new Blob([content], { type: "text/plain;charset=utf-8" });
      downloadBlob(entry.name, blob);
      notifications.push("File exported", entry.name);
    } catch (error) {
      notifications.push("Export failed", error instanceof Error ? error.message : String(error));
    }
  };

  const beginCreate = (kind: "file" | "dir") => {
    setCreateKind(kind);
    setDraftName("");
    setCreateOpen(true);
  };

  const createEntry = () => {
    const name = safeName(draftName());
    if (!name) return;
    const target = `${path()}/${name}`;
    try {
      if (createKind() === "dir") vfs.mkdir(target);
      else vfs.write(target, "");
      void vfs.flush?.();
      setCreateOpen(false);
      setSelected(target);
      setPreview(createKind() === "file" ? "" : null);
      refresh();
    } catch (error) {
      notifications.push("Create failed", error instanceof Error ? error.message : String(error));
    }
  };

  const removeSelected = () => {
    const entry = selectedEntry();
    if (!entry) return;
    vfs.remove(entry.path);
    void vfs.flush?.();
    setSelected(null);
    setPreview(null);
    setDeleteOpen(false);
    refresh();
  };

  return (
    <Stack gap={12}>
      <Breadcrumb items={breadcrumbs()} label="Files path" />

      <Row gap={8}>
        <Button variant="ghost" onClick={() => beginCreate("file")}>
          New file
        </Button>
        <Button variant="ghost" onClick={() => beginCreate("dir")}>
          New folder
        </Button>
        <FilePickerButton label="Import" multiple onFiles={importFiles} />
        <Button variant="ghost" disabled={selectedEntry()?.kind !== "file"} onClick={exportSelected}>
          Export
        </Button>
        <Button
          variant="ghost"
          disabled={!selectedEntry()}
          onClick={() => setDeleteOpen(true)}
        >
          Delete
        </Button>
        <Button variant="ghost" onClick={refresh}>
          Refresh
        </Button>
      </Row>

      <List
        label="Files"
        items={items()}
        selectedId={selected() ?? undefined}
        onSelect={openById}
        empty="Empty folder"
      />

      <Show when={preview() !== null}>
        <pre class="vela-file-preview">{preview()}</pre>
      </Show>

      <Dialog
        open={createOpen()}
        title={createKind() === "dir" ? "New folder" : "New file"}
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={createEntry}>
              Create
            </Button>
          </>
        }
      >
        <Stack gap={6}>
          <Label muted>{path()}</Label>
          <Input
            aria-label="Name"
            placeholder="Name"
            value={draftName()}
            onInput={(event) => setDraftName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") createEntry();
            }}
          />
        </Stack>
      </Dialog>

      <Confirm
        open={deleteOpen()}
        title="Delete item"
        message={`Delete ${selectedEntry()?.name ?? "this item"}? This cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={removeSelected}
        onCancel={() => setDeleteOpen(false)}
      />
    </Stack>
  );
}
