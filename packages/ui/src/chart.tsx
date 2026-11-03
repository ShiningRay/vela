import { createEffect, createMemo, onCleanup, Show, type JSX } from "solid-js";
import { formatChartValue } from "@vela/core";
import type { ChartEncoding, ChartRow, ChartSpec } from "@vela/core";
import * as echarts from "echarts/core";
import { BarChart, GaugeChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { Table } from "./data";
import type { TableColumn, TableRow } from "./data";
import { Label } from "./primitives/button";

echarts.use([
  BarChart,
  GaugeChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export interface ChartTheme {
  colors?: string[];
  textColor?: string;
  axisColor?: string;
}

export const DEFAULT_CHART_COLORS = [
  "#5b8def",
  "#3fb68b",
  "#f2a93b",
  "#e2637f",
  "#8f6fd8",
  "#4fb3c6",
  "#d97b4f",
];

type EChartsKind = "line" | "bar" | "pie" | "gauge" | "scatter";

function numberFrom(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * ChartSpec → ECharts option. A pure function so the mapping rules are unit
 * testable without a renderer; kpi/table never reach ECharts (they are layout,
 * not graphics) and return null here.
 */
export function mapSpecToOption(
  spec: ChartSpec,
  rows: ChartRow[],
  theme: ChartTheme = {},
): EChartsCoreOption | null {
  const kind = spec.kind;
  if (kind === "kpi" || kind === "table") return null;

  const encoding: ChartEncoding = spec.encoding;
  const decimals = spec.decimals ?? 0;
  const colors = theme.colors ?? DEFAULT_CHART_COLORS;
  const textColor = theme.textColor ?? "currentColor";
  const axisColor = theme.axisColor ?? "currentColor";

  if (kind === "pie") {
    return {
      color: colors,
      title: spec.title ? { text: spec.title, textStyle: { color: textColor } } : undefined,
      tooltip: { trigger: "item" },
      legend: { textStyle: { color: textColor } },
      series: [
        {
          type: "pie",
          radius: "62%",
          data: rows.map((row) => ({
            name: String(row[encoding.name ?? "name"] ?? ""),
            value: numberFrom(row[encoding.value ?? "value"]),
          })),
          itemStyle: { borderWidth: 1 },
        },
      ],
    };
  }

  if (kind === "gauge") {
    const first = rows[0] ?? {};
    return {
      color: colors,
      title: spec.title ? { text: spec.title, textStyle: { color: textColor } } : undefined,
      series: [
        {
          type: "gauge",
          max: encoding.max ?? 100,
          progress: { show: true },
          axisLine: { lineStyle: { color: [[1, axisColor]] } },
          axisLabel: { color: textColor },
          data: [
            {
              value: numberFrom(first[encoding.value ?? "value"]),
              name: spec.title ?? "",
            },
          ],
        },
      ],
    };
  }

  // line / bar / scatter share the cartesian shape.
  const xType = spec.xType ?? "category";
  const seriesNames: string[] = [];
  let series: Array<Record<string, unknown>> = [];

  if (typeof encoding.y === "string") {
    const yField: string = encoding.y;
    if (encoding.series) {
      const seriesField = encoding.series;
      const groups = new Map<string, Array<[string, number]>>();
      for (const row of rows) {
        const key = String(row[seriesField] ?? "");
        const entry = groups.get(key) ?? [];
        entry.push([String(row[encoding.x ?? "x"] ?? ""), numberFrom(row[yField])]);
        groups.set(key, entry);
      }
      for (const [name, data] of groups) {
        seriesNames.push(name);
        series.push({ name, type: kind, data, ...(kind === "scatter" ? { symbolSize: 8 } : {}) });
      }
    } else {
      seriesNames.push(yField);
      series = [
        {
          name: yField,
          type: kind,
          data: rows.map((row) => [String(row[encoding.x ?? "x"] ?? ""), numberFrom(row[yField])]),
          ...(kind === "scatter" ? { symbolSize: 8 } : {}),
        },
      ];
    }
  } else {
    const fields = Array.isArray(encoding.y) ? encoding.y : [];
    for (const field of fields) seriesNames.push(field);
    series = fields.map((field) => ({
      name: field,
      type: kind,
      data: rows.map((row) => [String(row[encoding.x ?? "x"] ?? ""), numberFrom(row[field])]),
      ...(kind === "scatter" ? { symbolSize: 8 } : {}),
    }));
  }

  const categoryData =
    xType === "category" ? [...new Set(rows.map((row) => String(row[encoding.x ?? "x"] ?? "")))] : undefined;

  return {
    color: colors,
    title: spec.title ? { text: spec.title, textStyle: { color: textColor } } : undefined,
    tooltip: { trigger: kind === "scatter" ? "item" : "axis" },
    legend: seriesNames.length > 1 ? { textStyle: { color: textColor } } : undefined,
    grid: { left: 8, right: 8, top: 28, bottom: 8, containLabel: true },
    xAxis: {
      type: xType,
      ...(categoryData ? { data: categoryData } : {}),
      axisLabel: { color: textColor },
      axisLine: { lineStyle: { color: axisColor } },
      ...(spec.yUnit ? { name: spec.yUnit } : {}),
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: textColor,
        formatter: (value: number) => value.toFixed(decimals),
      },
      ...(spec.yUnit ? { name: spec.yUnit } : {}),
    },
    series,
  };
}

function tableColumns(spec: ChartSpec, rows: ChartRow[]): TableColumn[] {
  const fields = spec.encoding.columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  return fields.map((field) => ({ id: field, label: field }));
}

function tableRows(rows: ChartRow[]): TableRow[] {
  return rows.map((row, index) => ({
    id: String(index),
    cells: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value ?? "")])),
  }));
}

export interface ChartProps {
  spec: ChartSpec;
  rows?: ChartRow[];
  /** Fixed pixel size; the chart fills its container when omitted. */
  width?: number;
  height?: number;
  theme?: ChartTheme;
  class?: string;
}

/**
 * Declarative chart renderer. kpi and table use plain UI components; the five
 * graphical kinds render through ECharts. A chart whose data has not arrived
 * shows a waiting placeholder instead of an empty axis frame.
 */
export function Chart(props: ChartProps): JSX.Element {
  const data = (): ChartRow[] | null => (props.rows && props.rows.length > 0 ? props.rows : null);
  const containerClass = (): string => `vela-chart ${props.class ?? ""}`;

  return (
    <Show
      when={data()}
      keyed
      fallback={
        <div class={`${containerClass()} vela-chart--waiting`} data-waiting="true">
          <span class="vela-chart__waiting-label">Waiting for data…</span>
        </div>
      }
    >
      {(rows) => (
        <Show
          when={props.spec.kind === "kpi"}
          fallback={
            <Show
              when={props.spec.kind === "table"}
              fallback={<EChartsChart {...props} rows={rows} class={containerClass()} />}
            >
              <div class={containerClass()} data-chart-kind="table">
                <Table columns={tableColumns(props.spec, rows)} rows={tableRows(rows)} />
              </div>
            </Show>
          }
        >
          <div class={containerClass()} data-chart-kind="kpi">
            <Show when={props.spec.title}>
              <Label muted>{props.spec.title}</Label>
            </Show>
            <span class="vela-chart__kpi-value">
              {formatChartValue(props.spec, rows.at(-1)?.[props.spec.encoding.value ?? "value"])}
            </span>
            <Show when={props.spec.encoding.series && rows.length > 0}>
              <Label muted>{String(rows.at(-1)?.[props.spec.encoding.series as string] ?? "")}</Label>
            </Show>
          </div>
        </Show>
      )}
    </Show>
  );
}

function EChartsChart(props: ChartProps & { rows: ChartRow[]; class: string }): JSX.Element {
  let element: HTMLDivElement | undefined;
  let instance: echarts.ECharts | null = null;
  const kind = (): EChartsKind => props.spec.kind as EChartsKind;

  createEffect(() => {
    if (!element) return;
    instance = echarts.init(element, undefined, {
      renderer: "canvas",
      ...(props.width ? { width: props.width } : {}),
      ...(props.height ? { height: props.height } : {}),
    });
    onCleanup(() => {
      instance?.dispose();
      instance = null;
    });
  });

  createEffect(() => {
    const option = mapSpecToOption(
      { ...props.spec, kind: kind() },
      props.rows,
      props.theme,
    );
    if (instance && option) instance.setOption(option, { notMerge: true });
  });

  return <div ref={element} class={props.class} data-chart-kind={kind()} role="img" aria-label={props.spec.title ?? kind()} />;
}
