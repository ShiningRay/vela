// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { Chart, mapSpecToOption } from "../src/chart";
import type { ChartSpec, ChartRow } from "@vela/core";

const lineSpec: ChartSpec = { kind: "line", encoding: { x: "date", y: "revenue" } };
const rows: ChartRow[] = [
  { date: "2026-01-01", revenue: 12 },
  { date: "2026-01-02", revenue: 30 },
  { date: "2026-01-03", revenue: 24 },
];

describe("mapSpecToOption", () => {
  it("returns null for kpi and table", () => {
    expect(mapSpecToOption({ kind: "kpi", encoding: { value: "v" } }, rows)).toBeNull();
    expect(mapSpecToOption({ kind: "table", encoding: {} }, rows)).toBeNull();
  });

  it("maps a line spec to category axis and single series", () => {
    const option = mapSpecToOption(lineSpec, rows) as Record<string, any>;
    expect(option.xAxis.type).toBe("category");
    expect(option.xAxis.data).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    expect(option.series).toHaveLength(1);
    expect(option.series[0].type).toBe("line");
    expect(option.series[0].data).toEqual([
      ["2026-01-01", 12],
      ["2026-01-02", 30],
      ["2026-01-03", 24],
    ]);
  });

  it("maps a bar spec with an array y into one series per field", () => {
    const spec: ChartSpec = { kind: "bar", encoding: { x: "date", y: ["revenue", "cost"] } };
    const option = mapSpecToOption(spec, rows) as Record<string, any>;
    expect(option.series.map((entry: any) => entry.name)).toEqual(["revenue", "cost"]);
    expect(option.series.every((entry: any) => entry.type === "bar")).toBe(true);
    expect(option.legend).toBeDefined();
  });

  it("groups rows into series when encoding.series is set", () => {
    const spec: ChartSpec = { kind: "line", encoding: { x: "date", y: "revenue", series: "region" } };
    const data: ChartRow[] = [
      { date: "2026-01-01", region: "east", revenue: 5 },
      { date: "2026-01-01", region: "west", revenue: 7 },
      { date: "2026-01-02", region: "east", revenue: 9 },
    ];
    const option = mapSpecToOption(spec, data) as Record<string, any>;
    expect(option.series.map((entry: any) => entry.name)).toEqual(["east", "west"]);
    expect(option.series[0].data).toEqual([
      ["2026-01-01", 5],
      ["2026-01-02", 9],
    ]);
  });

  it("maps a pie spec to name/value pairs", () => {
    const spec: ChartSpec = { kind: "pie", encoding: { name: "region", value: "revenue" } };
    const pieRows: ChartRow[] = [
      { region: "east", revenue: 12 },
      { region: "west", revenue: 30 },
    ];
    const option = mapSpecToOption(spec, pieRows) as Record<string, any>;
    expect(option.series[0].type).toBe("pie");
    expect(option.series[0].data).toEqual([
      { name: "east", value: 12 },
      { name: "west", value: 30 },
    ]);
  });

  it("maps a gauge spec using the first row and required max", () => {
    const spec: ChartSpec = { kind: "gauge", encoding: { value: "revenue", max: 100 } };
    const option = mapSpecToOption(spec, rows) as Record<string, any>;
    expect(option.series[0].type).toBe("gauge");
    expect(option.series[0].max).toBe(100);
    expect(option.series[0].data[0].value).toBe(12);
  });

  it("maps a scatter spec with item tooltips and time axis support", () => {
    const spec: ChartSpec = { kind: "scatter", xType: "time", encoding: { x: "date", y: "revenue" } };
    const option = mapSpecToOption(spec, rows) as Record<string, any>;
    expect(option.series[0].type).toBe("scatter");
    expect(option.xAxis.type).toBe("time");
    expect(option.xAxis.data).toBeUndefined();
    expect(option.tooltip.trigger).toBe("item");
  });

  it("applies theme colors", () => {
    const option = mapSpecToOption(lineSpec, rows, { colors: ["#fff", "#000"] }) as Record<string, any>;
    expect(option.color).toEqual(["#fff", "#000"]);
  });
});

describe("<Chart>", () => {
  it("shows the waiting placeholder before data arrives", () => {
    const { container, unmount } = render(() => <Chart spec={lineSpec} />);
    const waiting = container.querySelector(".vela-chart--waiting");
    expect(waiting).not.toBeNull();
    expect(waiting!.getAttribute("data-waiting")).toBe("true");
    expect(waiting!.textContent).toContain("Waiting for data");
    unmount();
  });

  it("renders kpi with the last row value, decimals and unit", () => {
    const spec: ChartSpec = { kind: "kpi", title: "Revenue", encoding: { value: "revenue" }, decimals: 1, yUnit: "M" };
    const { container, unmount } = render(() => <Chart spec={spec} rows={rows} />);
    const kpi = container.querySelector('[data-chart-kind="kpi"]');
    expect(kpi).not.toBeNull();
    expect(kpi!.querySelector(".vela-chart__kpi-value")!.textContent).toBe("24.0 M");
    unmount();
  });

  it("renders kpi waiting placeholder when rows are empty", () => {
    const spec: ChartSpec = { kind: "kpi", encoding: { value: "revenue" } };
    const { container, unmount } = render(() => <Chart spec={spec} rows={[]} />);
    expect(container.querySelector('[data-waiting="true"]')).not.toBeNull();
    unmount();
  });

  it("renders a table with declared columns", () => {
    const spec: ChartSpec = { kind: "table", encoding: { columns: ["date", "revenue"] } };
    const { container, unmount } = render(() => <Chart spec={spec} rows={rows.slice(0, 2)} />);
    const table = container.querySelector('[data-chart-kind="table"] table');
    expect(table).not.toBeNull();
    expect(table!.querySelectorAll("thead th")).toHaveLength(2);
    expect(table!.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(table!.querySelectorAll("tbody tr")[1]!.textContent).toContain("30");
    unmount();
  });
});
