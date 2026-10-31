import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { MarketError } from "./types";
import { MarketplaceStore } from "./store";

const MAX_UPLOAD_BYTES = 6_000_000;
const DEFAULT_PUBLIC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public",
);

function tokenMatches(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function bearer(req: Request): string {
  const header = req.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function numberParam(value: unknown, fallback: number): number {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringBody(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

export interface CreateAppOptions {
  store: MarketplaceStore;
  adminToken: string;
  publicDir?: string;
}

export function createApp(options: CreateAppOptions) {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    if (!options.adminToken) {
      res.status(503).json({ error: "Upload token is not configured" });
      return;
    }
    if (!tokenMatches(bearer(req), options.adminToken)) {
      res.status(401).json({ error: "Invalid admin token" });
      return;
    }
    next();
  };

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "vela-marketplace" });
  });

  app.get("/api/plugins", (req, res) => {
    const query = stringBody(req.query.q);
    const page = numberParam(req.query.page, 1);
    const pageSize = numberParam(req.query.pageSize, 24);
    res.json(options.store.list(query, page, pageSize));
  });

  app.get("/api/plugins/:id", (req, res) => {
    const plugin = options.store.get(req.params.id);
    if (!plugin) {
      res.status(404).json({ error: "Unknown plugin" });
      return;
    }
    res.json({ ...plugin, versions: options.store.versions(plugin.id) });
  });

  app.get("/api/plugins/:id/download", (req, res, next) => {
    try {
      const version = stringBody(req.query.version) || "latest";
      const target = options.store.download(req.params.id, version);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("X-VPK-SHA256", target.sha256);
      res.download(target.filePath, target.fileName, (error) => {
        if (error && !res.headersSent) next(error);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/plugins", requireAdmin, upload.single("file"), (req, res, next) => {
    try {
      if (!req.file) throw new MarketError(400, "file field is required");
      const tags = stringBody(req.body.tags)
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const plugin = options.store.publish({
        buffer: req.file.buffer,
        description: stringBody(req.body.description),
        author: stringBody(req.body.author),
        homepage: stringBody(req.body.homepage),
        tags,
      });
      res.status(201).json(plugin);
    } catch (error) {
      next(error);
    }
  });

  app.use(express.static(options.publicDir ?? DEFAULT_PUBLIC_DIR));

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof MarketError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof multer.MulterError) {
      const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      res.status(status).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Internal marketplace error" });
  });

  return app;
}
