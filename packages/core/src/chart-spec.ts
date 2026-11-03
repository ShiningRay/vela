/**
 * ChartSpec: a declarative chart DSL.
 *
 * The spec deliberately does not pass through the underlying chart library's
 * option object: a closed field set keeps JSON Schema validation strict and
 * the theme consistent, and lets an agent fix a rejected spec in one patch
 * because every error carries `path`, `message` and (for unknown fields) an
 * `available` list. Spec and data are decoupled: the spec references row
 * fields by name through `encoding`, and rows arrive separately as an array
 * of `Record<string, unknown>`.
 */

export type ChartKind = "line" | "bar" | "pie" | "gauge" | "kpi" | "table" | "scatter";

export type ChartXType = "category" | "time" | "value";

export interface ChartEncoding {
  /** Category/time/value field for line, bar and scatter. */
  x?: string;
  /** Value field(s). An array means one series per entry; mutually exclusive with `series`. */
  y?: string | string[];
  /** Field grouped into series; mutually exclusive with an array `y`. */
  series?: string;
  /** Category label field for pie. */
  name?: string;
  /** Value field for pie, gauge and kpi. */
  value?: string;
  /** Column fields for table; defaults to every field present in the rows. */
  columns?: string[];
  /** Gauge upper bound. Required for gauge. */
  max?: number;
}

export interface ChartSpec {
  kind: ChartKind;
  title?: string;
  encoding: ChartEncoding;
  /** How the x field is interpreted for line, bar and scatter. */
  xType?: ChartXType;
  /** Decimal digits for rendered numbers (kpi, axes, tooltips). */
  decimals?: number;
  /** Unit appended to rendered numbers (kpi, axis name). */
  yUnit?: string;
}

export type ChartRow = Record<string, unknown>;

/** Hard cap for one data publication; larger sets must be aggregated upstream. */
export const MAX_CHART_ROWS = 5000;

export type ChartSpecErrorCode =
  | "invalid_spec"
  | "unknown_field"
  | "kind_encoding_mismatch"
  | "encoding_conflict"
  | "missing_max"
  | "non_numeric_value"
  | "invalid_time"
  | "too_many_rows";

export interface ChartSpecError {
  code: ChartSpecErrorCode;
  /** Location inside the spec or data, e.g. `encoding.y` or `rows[3].revenue`. */
  path: string;
  message: string;
  /** Field names available at `path` so an agent can self-correct in one patch. */
  available?: string[];
}

export interface ChartSpecValidation {
  ok: boolean;
  errors: ChartSpecError[];
}

const CHART_KINDS: readonly ChartKind[] = ["line", "bar", "pie", "gauge", "kpi", "table", "scatter"];

/** JSON Schema for ChartSpec, distributed with the agent skill documentation. */
export function chartSpecJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["kind", "encoding"],
    properties: {
      kind: { enum: [...CHART_KINDS] },
      title: { type: "string", maxLength: 120 },
      xType: { enum: ["category", "time", "value"] },
      decimals: { type: "integer", minimum: 0, maximum: 8 },
      yUnit: { type: "string", maxLength: 16 },
      encoding: {
        type: "object",
        additionalProperties: false,
        properties: {
          x: { type: "string" },
          y: { type: ["string", "array"], items: { type: "string" } },
          series: { type: "string" },
          name: { type: "string" },
          value: { type: "string" },
          columns: { type: "array", items: { type: "string" } },
          max: { type: "number" },
        },
      },
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strict ISO 8601 calendar check; loose `Date.parse` is browser-dependent. */
export function isIso8601(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}([Tt]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?([Zz]|[+-]\d{2}:?\d{2})?)?$/.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed);
}

function fieldNames(rows: ChartRow[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) names.add(key);
  }
  return [...names].sort();
}

function isNumeric(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string" && value.trim() !== "") return Number.isFinite(Number(value));
  return false;
}

interface Shape {
  x?: boolean;
  y?: boolean;
  series?: boolean;
  name?: boolean;
  value?: boolean;
  columns?: boolean;
  max?: boolean;
}

const SHAPES: Record<ChartKind, Shape> = {
  line: { x: true, y: true, series: true },
  bar: { x: true, y: true, series: true },
  scatter: { x: true, y: true, series: true },
  pie: { name: true, value: true },
  gauge: { value: true, max: true },
  kpi: { value: true },
  table: { columns: true },
};

function missingForKind(kind: ChartKind, encoding: ChartEncoding): string[] {
  const required: string[] = [];
  if (SHAPES[kind].x && !encoding.x) required.push("encoding.x");
  if (SHAPES[kind].y && !encoding.y) required.push("encoding.y");
  if (SHAPES[kind].name && !encoding.name) required.push("encoding.name");
  if (SHAPES[kind].value && !encoding.value) required.push("encoding.value");
  return required;
}

/**
 * Structural + semantic validation. `rows` is optional: a spec can be created
 * before its data arrives; field presence is only checked against rows that
 * exist. Every failure carries a structured error, never a thrown exception.
 */
export function validateChartSpec(spec: unknown, rows?: ChartRow[]): ChartSpecValidation {
  const errors: ChartSpecError[] = [];

  if (!isPlainObject(spec)) {
    return { ok: false, errors: [{ code: "invalid_spec", path: "", message: "ChartSpec must be an object." }] };
  }

  const kind = spec.kind;
  if (typeof kind !== "string" || !CHART_KINDS.includes(kind as ChartKind)) {
    return {
      ok: false,
      errors: [{
        code: "invalid_spec",
        path: "kind",
        message: `kind must be one of: ${CHART_KINDS.join(", ")}.`,
        available: [...CHART_KINDS],
      }],
    };
  }

  const encoding = spec.encoding;
  if (!isPlainObject(encoding)) {
    return {
      ok: false,
      errors: [{ code: "invalid_spec", path: "encoding", message: "encoding must be an object." }],
    };
  }
  const enc = encoding as unknown as ChartEncoding;

  if (spec.title !== undefined && typeof spec.title !== "string") {
    errors.push({ code: "invalid_spec", path: "title", message: "title must be a string." });
  }
  if (spec.xType !== undefined && !["category", "time", "value"].includes(spec.xType as string)) {
    errors.push({
      code: "invalid_spec",
      path: "xType",
      message: "xType must be category, time or value.",
      available: ["category", "time", "value"],
    });
  }
  if (spec.decimals !== undefined && (typeof spec.decimals !== "number" || !Number.isInteger(spec.decimals) || spec.decimals < 0 || spec.decimals > 8)) {
    errors.push({ code: "invalid_spec", path: "decimals", message: "decimals must be an integer between 0 and 8." });
  }
  if (spec.yUnit !== undefined && typeof spec.yUnit !== "string") {
    errors.push({ code: "invalid_spec", path: "yUnit", message: "yUnit must be a string." });
  }

  const shape = SHAPES[kind as ChartKind];
  for (const key of Object.keys(encoding)) {
    if (!(key in shape)) {
      errors.push({
        code: "kind_encoding_mismatch",
        path: `encoding.${key}`,
        message: `encoding.${key} is not valid for kind "${kind}".`,
        available: Object.keys(shape),
      });
    }
  }
  if (enc.max !== undefined && (typeof enc.max !== "number" || !Number.isFinite(enc.max))) {
    errors.push({ code: "invalid_spec", path: "encoding.max", message: "encoding.max must be a finite number." });
  }
  for (const key of ["x", "series", "name", "value"] as const) {
    if (encoding[key] !== undefined && typeof encoding[key] !== "string") {
      errors.push({ code: "invalid_spec", path: `encoding.${key}`, message: `encoding.${key} must be a field name string.` });
    }
  }
  if (enc.columns !== undefined && (!Array.isArray(enc.columns) || enc.columns.some((column) => typeof column !== "string"))) {
    errors.push({ code: "invalid_spec", path: "encoding.columns", message: "encoding.columns must be an array of field names." });
  }
  if (enc.y !== undefined) {
    if (Array.isArray(enc.y)) {
      if (!enc.y.every((entry) => typeof entry === "string")) {
        errors.push({ code: "invalid_spec", path: "encoding.y", message: "encoding.y array entries must be field names." });
      }
    } else if (typeof enc.y !== "string") {
      errors.push({ code: "invalid_spec", path: "encoding.y", message: "encoding.y must be a field name or an array of field names." });
    }
  }

  // Semantic gate 2: `series` and a multi-element `y` are mutually exclusive.
  if (enc.series !== undefined && Array.isArray(enc.y) && enc.y.length > 1) {
    errors.push({
      code: "encoding_conflict",
      path: "encoding.series",
      message: "encoding.series cannot be combined with a multi-element encoding.y; use one or the other.",
    });
  }

  // Semantic gate 3: gauge requires max.
  if (kind === "gauge" && enc.max === undefined) {
    errors.push({
      code: "missing_max",
      path: "encoding.max",
      message: 'kind "gauge" requires encoding.max.',
    });
  }

  for (const required of missingForKind(kind as ChartKind, enc)) {
    errors.push({
      code: "kind_encoding_mismatch",
      path: required,
      message: `kind "${kind}" requires ${required}.`,
      available: Object.keys(shape),
    });
  }

  const rowFields = rows ? fieldNames(rows) : null;
  const checkField = (key: string, value: string | undefined): void => {
    if (!value || !rowFields) return;
    if (!rowFields.includes(value)) {
      errors.push({
        code: "unknown_field",
        path: `encoding.${key}`,
        message: `encoding.${key} references unknown field "${value}".`,
        available: rowFields,
      });
    }
  };
  checkField("x", enc.x);
  checkField("series", enc.series);
  checkField("name", enc.name);
  checkField("value", enc.value);
  if (typeof enc.y === "string") checkField("y", enc.y);
  if (Array.isArray(enc.y)) for (const entry of enc.y) checkField("y", entry);
  if (enc.columns) for (const column of enc.columns) checkField("columns", column);

  if (rows) {
    if (rows.length > MAX_CHART_ROWS) {
      errors.push({
        code: "too_many_rows",
        path: "rows",
        message: `Data has ${rows.length} rows; the limit is ${MAX_CHART_ROWS}. Aggregate or downsample on the data side.`,
      });
    }
    validateRows(kind as ChartKind, encoding, spec.xType as ChartXType | undefined, rows, errors);
  }

  return { ok: errors.length === 0, errors };
}

function validateRows(
  kind: ChartKind,
  encoding: ChartEncoding,
  xType: ChartXType | undefined,
  rows: ChartRow[],
  errors: ChartSpecError[],
): void {
  const numericPaths: Array<[string, string | undefined]> = [];
  if (typeof encoding.y === "string") numericPaths.push(["y", encoding.y]);
  if (Array.isArray(encoding.y)) for (const entry of encoding.y) numericPaths.push(["y", entry]);
  if (kind === "pie" || kind === "gauge" || kind === "kpi") numericPaths.push(["value", encoding.value]);

  const timeField = xType === "time" ? encoding.x : undefined;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!isPlainObject(row)) {
      errors.push({ code: "invalid_spec", path: `rows[${index}]`, message: "Each row must be an object." });
      continue;
    }
    for (const [encodingKey, field] of numericPaths) {
      if (field === undefined) continue;
      const value = row[field];
      if (value === undefined || value === null || value === "") continue;
      if (!isNumeric(value)) {
        errors.push({
          code: "non_numeric_value",
          path: `rows[${index}].${field}`,
          message: `Field "${field}" used as encoding.${encodingKey} must be numeric; got ${JSON.stringify(value)}.`,
        });
      }
    }
    if (timeField) {
      const value = row[timeField];
      if (typeof value !== "string" || !isIso8601(value)) {
        errors.push({
          code: "invalid_time",
          path: `rows[${index}].${timeField}`,
          message: `xType "time" requires strict ISO 8601 strings in field "${timeField}"; got ${JSON.stringify(value ?? null)}.`,
        });
      }
    }
  }
}

/** Format a number according to the spec's `decimals`/`yUnit` settings. */
export function formatChartValue(spec: ChartSpec, value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value ?? "–");
  const decimals = spec.decimals ?? 0;
  const text = numeric.toFixed(decimals);
  return spec.yUnit ? `${text} ${spec.yUnit}` : text;
}
