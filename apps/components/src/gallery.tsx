import { createSignal, For, type JSX } from "solid-js";
import {
  Accordion,
  Alert,
  Badge,
  Breadcrumb,
  Button,
  Checkbox,
  ColorPicker,
  Confirm,
  ContextMenu,
  DatePicker,
  Dialog,
  Divider,
  EmptyState,
  Input,
  Kv,
  List,
  NumberInput,
  Pagination,
  Popover,
  Progress,
  Select,
  Slider,
  Spinner,
  StatusBar,
  Switch,
  Table,
  Tabs,
  Tag,
  Textarea,
  Toast,
  Toolbar,
  Tooltip,
  Tree,
} from "@vela/ui";

function Section(props: { title: string; description?: string; children?: JSX.Element }): JSX.Element {
  return (
    <section class="gallery-section">
      <header class="gallery-section__header">
        <h2>{props.title}</h2>
        {props.description ? <p>{props.description}</p> : null}
      </header>
      <div class="gallery-section__body">{props.children}</div>
    </section>
  );
}

function StackDemo(props: { children?: JSX.Element }): JSX.Element {
  return <div class="gallery-stack">{props.children}</div>;
}

export function Gallery(): JSX.Element {
  const [checked, setChecked] = createSignal(true);
  const [enabled, setEnabled] = createSignal(true);
  const [theme, setTheme] = createSignal("dark");
  const [volume, setVolume] = createSignal(45);
  const [count, setCount] = createSignal(3);
  const [tab, setTab] = createSignal("overview");
  const [page, setPage] = createSignal(4);
  const [selectedFile, setSelectedFile] = createSignal("readme");
  const [selectedNode, setSelectedNode] = createSignal("src");
  const [accent, setAccent] = createSignal("#7dd3fc");
  const [due, setDue] = createSignal("2026-11-01");
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [confirmOpen, setConfirmOpen] = createSignal(false);
  const [toastOpen, setToastOpen] = createSignal(false);

  return (
    <main class="gallery">
      <header class="gallery__hero">
        <div>
          <span class="gallery__eyebrow">@vela/ui</span>
          <h1>Component gallery</h1>
          <p>Primitives, feedback, layout, data and desktop controls on one Vite page.</p>
        </div>
        <StatusBar
          items={[
            { id: "version", label: "Version", value: "P2" },
            { id: "components", label: "Components", value: "32" },
            { id: "test", label: "Tests", value: "happy-dom" },
          ]}
        />
      </header>

      <Section title="Primitives" description="Text fields, choices and numeric controls.">
        <div class="gallery-grid">
          <StackDemo>
            <Input placeholder="Project name" aria-label="Project name" />
            <Textarea aria-label="Description" placeholder="Description" />
            <Checkbox label="Remember this choice" checked={checked()} onChange={(event) => setChecked(event.currentTarget.checked)} />
            <Switch checked={enabled()} label="Enable sync" onChange={setEnabled} />
          </StackDemo>
          <StackDemo>
            <Select
              label="Theme"
              value={theme()}
              onChange={setTheme}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
              ]}
            />
            <Slider label="Volume" value={volume()} onChange={setVolume} />
            <NumberInput label="Retries" value={count()} min={0} max={10} onChange={setCount} />
          </StackDemo>
        </div>
      </Section>

      <Section title="Feedback" description="Dialogs, transient messages and progress.">
        <div class="gallery-grid">
          <StackDemo>
            <div class="gallery-row">
              <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
              <Button variant="danger" onClick={() => setConfirmOpen(true)}>Delete item</Button>
              <Button variant="ghost" onClick={() => setToastOpen(true)}>Show toast</Button>
            </div>
            <Alert tone="warning" title="Heads up">
              This action changes the current workspace.
            </Alert>
            <Progress label="Indexing" value={62} />
            <Progress label="Connecting" indeterminate />
          </StackDemo>
          <StackDemo>
            <div class="gallery-row">
              <Spinner label="Loading" />
              <Tag tone="success">Ready</Tag>
              <Badge tone="danger" dot>Offline</Badge>
            </div>
            <EmptyState
              title="No components selected"
              description="Choose a component to inspect its props and states."
              icon="◇"
              action={<Button variant="primary">Browse</Button>}
            />
          </StackDemo>
        </div>
      </Section>

      <Section title="Layout" description="Tabs, disclosure, navigation and status.">
        <StackDemo>
          <Tabs
            label="Gallery tabs"
            value={tab()}
            onChange={setTab}
            tabs={[
              { id: "overview", label: "Overview" },
              { id: "props", label: "Props" },
              { id: "a11y", label: "Accessibility" },
            ]}
            panel={<div class="gallery-panel">Active panel: {tab()}</div>}
          />
          <Accordion
            defaultOpen={["one"]}
            items={[
              { id: "one", title: "Keyboard support", content: "Tab moves focus, Enter activates, Escape closes overlays." },
              { id: "two", title: "Styling", content: "All components consume @vela/theme CSS variables." },
            ]}
          />
          <Divider label="or" />
          <Breadcrumb
            items={[
              { id: "root", label: "Vela", onClick: () => setTab("overview") },
              { id: "ui", label: "@vela/ui" },
              { id: "gallery", label: "Gallery" },
            ]}
          />
          <Pagination page={page()} pageCount={12} onChange={setPage} />
          <Toolbar label="Editor actions">
            <Button variant="ghost">Undo</Button>
            <Button variant="ghost">Redo</Button>
            <Divider orientation="vertical" />
            <Button variant="ghost">Format</Button>
          </Toolbar>
        </StackDemo>
      </Section>

      <Section title="Data" description="Lists, tables, trees and metadata.">
        <div class="gallery-grid">
          <StackDemo>
            <List
              label="Files"
              selectedId={selectedFile()}
              onSelect={setSelectedFile}
              items={[
                { id: "readme", label: "README.md", meta: "file", icon: "·" },
                { id: "src", label: "src", meta: "dir", icon: "▸" },
                { id: "assets", label: "assets", meta: "dir", icon: "▸" },
              ]}
            />
            <Tree
              label="Source tree"
              selectedId={selectedNode()}
              onSelect={setSelectedNode}
              defaultExpanded={["src"]}
              nodes={[
                {
                  id: "src",
                  label: "src",
                  children: [
                    { id: "ui", label: "ui" },
                    { id: "desktop", label: "desktop" },
                  ],
                },
                { id: "docs", label: "docs" },
              ]}
            />
          </StackDemo>
          <StackDemo>
            <Table
              caption="Recent builds"
              columns={[
                { id: "name", label: "Target" },
                { id: "size", label: "Size", align: "right" },
              ]}
              rows={[
                { id: "app", cells: { name: "Vela.app", size: "121 MB" } },
                { id: "dmg", cells: { name: "Vela.dmg", size: "39 MB" } },
              ]}
            />
            <Kv
              columns={2}
              items={[
                { id: "runtime", label: "Runtime", value: "Solid 1.9" },
                { id: "shell", label: "Shell", value: "Tauri 2" },
                { id: "tests", label: "Tests", value: "Vitest + Playwright" },
                { id: "theme", label: "Theme", value: "CSS tokens" },
              ]}
            />
            <div class="gallery-row">
              <Tag tone="accent" onRemove={() => undefined}>accent</Tag>
              <Tag tone="warning">warning</Tag>
              <Badge tone="success" dot>online</Badge>
            </div>
          </StackDemo>
        </div>
      </Section>

      <Section title="Desktop" description="Popovers, tooltips, context menus and pickers.">
        <div class="gallery-grid">
          <StackDemo>
            <div class="gallery-row">
              <Popover label="Inspect">
                <List
                  items={[
                    { id: "props", label: "Props" },
                    { id: "events", label: "Events" },
                  ]}
                />
              </Popover>
              <Tooltip label="Shown on hover and focus">
                <span class="gallery-tooltip-target">Hover me</span>
              </Tooltip>
            </div>
            <ContextMenu
              items={[
                { id: "copy", label: "Copy", onSelect: () => undefined },
                { id: "rename", label: "Rename", onSelect: () => undefined },
                { id: "delete", label: "Delete", danger: true, onSelect: () => undefined },
              ]}
            >
              <div class="gallery-context-target">Right-click or Shift+F10</div>
            </ContextMenu>
          </StackDemo>
          <StackDemo>
            <ColorPicker
              label="Accent"
              value={accent()}
              swatches={["#7dd3fc", "#a78bfa", "#f472b6", "#4ade80", "#fbbf24"]}
              onChange={setAccent}
            />
            <DatePicker label="Due date" value={due()} onChange={setDue} />
            <For each={[1, 2, 3]}>
              {(item) => <Badge tone="neutral">Item {item}</Badge>}
            </For>
          </StackDemo>
        </div>
      </Section>

      <Dialog
        open={dialogOpen()}
        title="Dialog example"
        onClose={() => setDialogOpen(false)}
        footer={
          <Button variant="primary" onClick={() => setDialogOpen(false)}>
            Close
          </Button>
        }
      >
        Focus moves into the dialog. Escape closes it and Tab stays inside.
      </Dialog>

      <Confirm
        open={confirmOpen()}
        title="Delete item"
        message="This action cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => setConfirmOpen(false)}
        onCancel={() => setConfirmOpen(false)}
      />

      <Toast
        open={toastOpen()}
        title="Gallery saved"
        description="This toast auto-dismisses after five seconds."
        tone="success"
        onClose={() => setToastOpen(false)}
      />
    </main>
  );
}
