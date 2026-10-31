import { createSignal, For, onMount, Show } from "solid-js";
import {
  Alert,
  Button,
  EmptyState,
  Input,
  Label,
  Row,
  Select,
  Spinner,
  Stack,
  Tag,
} from "@vela/ui";
import { useDesktop } from "../context";
import { installPackage, listInstalledPackages, parseVpk, registerPackageApp } from "../packages";

type MarketCategory = "productivity" | "developer" | "finance" | "fun" | "system" | "other";
type MarketSort = "recent" | "downloads" | "rating";

interface MarketPlugin {
  id: string;
  name: string;
  description: string;
  author: string;
  publisherName: string;
  homepage: string;
  icon: string;
  category: MarketCategory;
  featured: boolean;
  tags: string[];
  latestVersion: string;
  size: number;
  downloads: number;
  rating: number;
  ratingCount: number;
  updatedAt: string;
}

const CATEGORY_LABELS: Record<MarketCategory, string> = {
  productivity: "Productivity",
  developer: "Developer",
  finance: "Finance",
  fun: "Fun",
  system: "System",
  other: "Other",
};

const CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
];

const SORT_OPTIONS: Array<{ value: MarketSort; label: string }> = [
  { value: "recent", label: "Newest" },
  { value: "downloads", label: "Most downloaded" },
  { value: "rating", label: "Top rated" },
];

interface PluginListResponse {
  items: MarketPlugin[];
  total: number;
  page: number;
  pageSize: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function baseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function MarketplaceApp() {
  const { apps, notifications, settings, vfs } = useDesktop();
  const [query, setQuery] = createSignal("");
  const [category, setCategory] = createSignal("");
  const [sort, setSort] = createSignal<MarketSort>("recent");
  const [plugins, setPlugins] = createSignal<MarketPlugin[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [installing, setInstalling] = createSignal<string | null>(null);
  const [revision, setRevision] = createSignal(0);
  let requestId = 0;

  const installed = () => {
    revision();
    return new Map(
      listInstalledPackages(vfs).map((pkg) => [pkg.manifest.id, pkg.manifest.version]),
    );
  };

  const installedVersion = (id: string): string | undefined => installed().get(id);

  async function load(search = query()): Promise<void> {
    const id = ++requestId;
    const url = baseUrl(settings.settings.marketplaceUrl);
    if (!url) {
      setError("Marketplace URL is empty. Set it in Settings → Marketplace URL.");
      setPlugins([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ pageSize: "60", sort: sort() });
      if (search.trim()) params.set("q", search.trim());
      if (category()) params.set("category", category());
      const response = await fetch(`${url}/api/plugins?${params}`);
      if (!response.ok) throw new Error(`Marketplace returned ${response.status}`);
      const data = (await response.json()) as PluginListResponse;
      if (id === requestId) setPlugins(Array.isArray(data.items) ? data.items : []);
    } catch (caught) {
      if (id === requestId) {
        setError(`Cannot reach marketplace: ${caught instanceof Error ? caught.message : String(caught)}`);
        setPlugins([]);
      }
    } finally {
      if (id === requestId) setLoading(false);
    }
  }

  async function install(plugin: MarketPlugin): Promise<void> {
    setInstalling(plugin.id);
    setError("");
    try {
      const url = baseUrl(settings.settings.marketplaceUrl);
      const response = await fetch(`${url}/api/plugins/${encodeURIComponent(plugin.id)}/download?version=latest`);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const pkg = parseVpk(await response.arrayBuffer());
      if (pkg.manifest.id !== plugin.id) {
        throw new Error(`Package id mismatch: expected ${plugin.id}, got ${pkg.manifest.id}`);
      }
      if (pkg.manifest.version !== plugin.latestVersion) {
        throw new Error(
          `Package version mismatch: expected ${plugin.latestVersion}, got ${pkg.manifest.version}`,
        );
      }
      installPackage(vfs, pkg);
      await vfs.flush?.();
      registerPackageApp(apps, pkg.manifest);
      setRevision((value) => value + 1);
      notifications.push("Plugin installed", `${pkg.manifest.name} ${pkg.manifest.version}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(`Install failed: ${message}`);
      notifications.push("Install failed", message);
    } finally {
      setInstalling(null);
    }
  }

  onMount(() => {
    void load();
  });

  return (
    <Stack gap={12} class="vela-market">
      <div class="vela-market__header">
        <div class="vela-market__heading">
          <h2>Plugin Market</h2>
          <Label muted>{baseUrl(settings.settings.marketplaceUrl) || "No marketplace configured"}</Label>
        </div>
        <Button variant="ghost" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <form
        class="vela-market__search"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <Input
          aria-label="Search plugins"
          type="search"
          placeholder="Search name, author or tag"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <Button type="submit">Search</Button>
      </form>

      <Row gap={8} class="vela-market__filters">
        <Select
          label="Category"
          value={category()}
          options={CATEGORY_OPTIONS}
          onChange={(value) => {
            setCategory(value);
            void load();
          }}
        />
        <Select
          label="Sort"
          value={sort()}
          options={SORT_OPTIONS}
          onChange={(value) => {
            setSort(value as MarketSort);
            void load();
          }}
        />
      </Row>

      <Show when={error()}>
        <Alert tone="danger" title="Marketplace error">
          {error()}
        </Alert>
      </Show>

      <Show when={loading()}>
        <Row gap={8} class="vela-market__loading">
          <Spinner label="Loading plugins" />
          <Label muted>Loading plugins…</Label>
        </Row>
      </Show>

      <Show when={!loading() && plugins().length === 0 && !error()}>
        <EmptyState
          icon="▩"
          title="No plugins found"
          description="Upload a .vpk to the marketplace, or try another search."
        />
      </Show>

      <div class="vela-market__grid">
        <For each={plugins()}>
          {(plugin) => (
            <article class="vela-market__card" data-plugin-id={plugin.id}>
              <div class="vela-market__card-head">
                <span class="vela-market__icon" aria-hidden="true">
                  {plugin.icon || "▣"}
                </span>
                <div class="vela-market__title">
                  <strong>{plugin.name}</strong>
                  <Label muted>
                    {`${plugin.publisherName || plugin.author || "Unknown publisher"} · ${CATEGORY_LABELS[plugin.category] ?? plugin.category} · v${plugin.latestVersion}`}
                  </Label>
                </div>
              </div>
              <p class="vela-market__description">{plugin.description || "No description"}</p>
              <div class="vela-market__tags">
                {plugin.featured ? <Tag tone="warning">Featured</Tag> : null}
                <For each={plugin.tags.slice(0, 5)}>{(tag) => <Tag tone="accent">{tag}</Tag>}</For>
              </div>
              <div class="vela-market__meta">
                <span>{plugin.ratingCount ? `★ ${plugin.rating.toFixed(1)} (${plugin.ratingCount})` : "No ratings"}</span>
                <span>{plugin.downloads} downloads</span>
                <span>{formatBytes(plugin.size)}</span>
              </div>
              <Row gap={8} class="vela-market__actions">
                <Show when={installedVersion(plugin.id)}>
                  {(version) => <Tag tone="success">Installed {version()}</Tag>}
                </Show>
                <Button
                  variant="primary"
                  disabled={installing() === plugin.id}
                  onClick={() => void install(plugin)}
                >
                  {installing() === plugin.id
                    ? "Installing…"
                    : installedVersion(plugin.id)
                      ? "Reinstall"
                      : "Install"}
                </Button>
              </Row>
            </article>
          )}
        </For>
      </div>
    </Stack>
  );
}
