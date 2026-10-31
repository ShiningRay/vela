import path from "node:path";
import { createApp } from "./app";
import { MarketplaceStore } from "./store";

const port = Number(process.env.MARKETPLACE_PORT ?? 4320);
const host = process.env.MARKETPLACE_HOST ?? "127.0.0.1";
const dataDir = path.resolve(process.env.MARKETPLACE_DATA_DIR ?? path.join(process.cwd(), "data"));
const adminToken = process.env.MARKETPLACE_ADMIN_TOKEN ?? "";

const store = new MarketplaceStore(dataDir);
const app = createApp({ store, adminToken });

const server = app.listen(port, host, () => {
  console.log(`[marketplace] http://${host}:${port}`);
  console.log(`[marketplace] data: ${dataDir}`);
  if (!adminToken) {
    console.warn("[marketplace] uploads disabled: set MARKETPLACE_ADMIN_TOKEN");
  }
});

const shutdown = (): void => {
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
