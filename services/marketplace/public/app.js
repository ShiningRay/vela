const pluginGrid = document.querySelector("#plugins");
const count = document.querySelector("#count");
const status = document.querySelector("#status");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search");
const uploadForm = document.querySelector("#upload-form");
const uploadStatus = document.querySelector("#upload-status");

let query = "";

function setStatus(text, tone = "") {
  status.textContent = text;
  status.dataset.tone = tone;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render(items) {
  pluginGrid.replaceChildren();
  count.textContent = `${items.length} 个插件`;
  if (items.length === 0) {
    pluginGrid.append(element("p", "empty", "没有找到插件。先上传一个 .vpk 吧。"));
    return;
  }
  for (const plugin of items) {
    const card = element("article", "card");
    const head = element("div", "card-head");
    head.append(element("span", "icon", plugin.icon || "▣"));
    const title = element("div", "title");
    title.append(element("h3", "", plugin.name));
    title.append(element("span", "version", `v${plugin.latestVersion}`));
    head.append(title);
    card.append(head);
    card.append(element("p", "description", plugin.description || "暂无描述"));
    const meta = element("div", "meta");
    meta.append(element("span", "", plugin.author || "未知作者"));
    meta.append(element("span", "", `${plugin.downloads} 次下载`));
    meta.append(element("span", "", formatBytes(plugin.size)));
    card.append(meta);
    if (plugin.tags.length) {
      const tags = element("div", "tags");
      for (const tag of plugin.tags) tags.append(element("span", "tag", tag));
      card.append(tags);
    }
    const actions = element("div", "actions");
    const download = element("a", "download", "下载 .vpk");
    download.href = `/api/plugins/${encodeURIComponent(plugin.id)}/download?version=latest`;
    download.setAttribute("download", `${plugin.id}-${plugin.latestVersion}.vpk`);
    actions.append(download);
    card.append(actions);
    pluginGrid.append(card);
  }
}

async function loadPlugins() {
  setStatus("加载中…");
  try {
    const params = new URLSearchParams({ pageSize: "100" });
    if (query) params.set("q", query);
    const response = await fetch(`/api/plugins?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    render(data.items);
    setStatus("");
  } catch (error) {
    setStatus(`加载失败：${error instanceof Error ? error.message : String(error)}`, "danger");
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  query = searchInput.value.trim();
  void loadPlugins();
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = document.querySelector("#file").files[0];
  const token = document.querySelector("#token").value;
  if (!file || !token) return;
  uploadStatus.textContent = "上传中…";
  uploadStatus.dataset.tone = "";
  const body = new FormData();
  body.set("file", file, file.name);
  body.set("description", document.querySelector("#description").value);
  body.set("author", document.querySelector("#author").value);
  body.set("tags", document.querySelector("#tags").value);
  try {
    const response = await fetch("/api/plugins", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    uploadStatus.textContent = `已上架 ${result.name} v${result.latestVersion}`;
    uploadStatus.dataset.tone = "success";
    uploadForm.reset();
    await loadPlugins();
  } catch (error) {
    uploadStatus.textContent = `上传失败：${error instanceof Error ? error.message : String(error)}`;
    uploadStatus.dataset.tone = "danger";
  }
});

void loadPlugins();
