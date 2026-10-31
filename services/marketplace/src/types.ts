export interface VpkManifest {
  id: string;
  name: string;
  version: string;
  entry: string;
  icon?: string;
  window?: { width: number; height: number };
}

export interface PluginVersion {
  version: string;
  file: string;
  size: number;
  sha256: string;
  downloads: number;
  createdAt: string;
}

export interface PluginRecord {
  id: string;
  name: string;
  description: string;
  author: string;
  homepage: string;
  icon: string;
  tags: string[];
  versions: PluginVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface PluginSummary {
  id: string;
  name: string;
  description: string;
  author: string;
  homepage: string;
  icon: string;
  tags: string[];
  latestVersion: string;
  size: number;
  downloads: number;
  updatedAt: string;
}

export interface PluginList {
  items: PluginSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PublishInput {
  buffer: Uint8Array;
  description?: string;
  author?: string;
  homepage?: string;
  tags?: string[];
}

export interface DownloadTarget {
  filePath: string;
  fileName: string;
  version: string;
  sha256: string;
}

export class MarketError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "MarketError";
    this.status = status;
  }
}
