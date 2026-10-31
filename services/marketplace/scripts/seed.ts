import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { MarketplaceStore } from "../src/store";
import { MarketError } from "../src/types";

const sourceDir = path.resolve(
  process.env.VELA_APPS_VPK_DIR ?? path.join(process.cwd(), "../../../vela-apps/dist/vpk"),
);
const dataDir = path.resolve(process.env.MARKETPLACE_DATA_DIR ?? path.join(process.cwd(), "data"));
const store = new MarketplaceStore(dataDir);

const meta: Record<string, { description: string; author: string; tags: string[]; homepage: string }> = {
  "scientific-calculator.vpk": {
    description: "理性精确求值、deg/rad 三角、历史记录的科学计算器。",
    author: "ShiningRay",
    tags: ["calculator", "science", "solid"],
    homepage: "https://github.com/ShiningRay/vela-apps",
  },
  "citrine-sheets.vpk": {
    description: "Citrine Sheets：公式、依赖图、撤销重做的迷你电子表格。",
    author: "ShiningRay",
    tags: ["spreadsheet", "ruby", "opal"],
    homepage: "https://github.com/ShiningRay/citrine-sheets",
  },
  "citrine-market-terminal.vpk": {
    description: "随机行情驱动的模拟交易终端，带自选、图表与账户曲线。",
    author: "ShiningRay",
    tags: ["market", "trading", "ruby"],
    homepage: "https://github.com/ShiningRay/citrine-market-terminal",
  },
};

for (const name of (await readdir(sourceDir)).filter((entry) => entry.endsWith(".vpk")).sort()) {
  const file = path.join(sourceDir, name);
  const details = meta[name] ?? { description: "", author: "ShiningRay", tags: [], homepage: "" };
  try {
    const plugin = store.publish({
      buffer: await readFile(file),
      ...details,
    });
    console.log(`[seed] ${plugin.id}@${plugin.latestVersion}`);
  } catch (error) {
    if (error instanceof MarketError && error.status === 409) {
      console.log(`[seed] skipped existing ${name}`);
      continue;
    }
    throw error;
  }
}
