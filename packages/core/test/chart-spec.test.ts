import { describe, expect, it } from "vitest";
import {
  MAX_CHART_ROWS,
  chartSpecJsonSchema,
  isIso8601,
  validateChartSpec,
} from "../src/chart-spec";

describe("chartSpecJsonSchema", () => {
  it("exposes the seven kinds", () => {
    const schema = chartSpecJsonSchema();
    expect(schema.properties).toHaveProperty("kind");
    expect((schema.properties as Record<string, unknown>).kind).toMatchObject({
      enum: ["line", "bar", "pie", "gauge", "kpi", "table", "scatter"],
    });
  });
});

describe("validateChartSpec", () => {
  it("accepts a line spec with matching rows", () => {
    const spec = { kind: "line", encoding: { x: "date", y: "revenue" } };
    const result = validateChartSpec(spec, [
      { date: "2026-01-01", revenue: 12 },
      { date: "2026-01-02", revenue: 30 },
    ]);
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("rejects a non-object spec", () => {
    expect(validateChartSpec(null).ok).toBe(false);
    expect(validateChartSpec("line").ok).toBe(false);
    expect(validateChartSpec([]).errors[0]).toMatchObject({ code: "invalid_spec", path: "" });
  });

  it("rejects unknown kinds and lists available ones", () => {
    const result = validateChartSpec({ kind: "treemap", encoding: {} });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ code: "invalid_spec", path: "kind" });
    expect(result.errors[0]!.available).toContain("line");
  });

  it("rejects encoding fields that do not match the kind", () => {
    const result = validateChartSpec({ kind: "kpi", encoding: { x: "date", value: "v" } });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "kind_encoding_mismatch", path: "encoding.x" }),
      ]),
    );
  });

  it("requires the encoding fields each kind needs", () => {
    expect(validateChartSpec({ kind: "pie", encoding: {} }).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "kind_encoding_mismatch", path: "encoding.name" }),
        expect.objectContaining({ code: "kind_encoding_mismatch", path: "encoding.value" }),
      ]),
    );
    expect(validateChartSpec({ kind: "line", encoding: {} }).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "kind_encoding_mismatch", path: "encoding.y" }),
      ]),
    );
  });

  it("flags unknown fields with the available list", () => {
    const spec = { kind: "line", encoding: { x: "date", y: "revnue" } };
    const result = validateChartSpec(spec, [{ date: "2026-01-01", revenue: 1 }]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({
      code: "unknown_field",
      path: "encoding.y",
      available: ["date", "revenue"],
    });
  });

  it("requires max for gauge", () => {
    const result = validateChartSpec({ kind: "gauge", encoding: { value: "cpu" } });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "missing_max", path: "encoding.max" })]),
    );
    expect(validateChartSpec({ kind: "gauge", encoding: { value: "cpu", max: 100 } }).ok).toBe(true);
  });

  it("rejects series combined with a multi-element y", () => {
    const spec = { kind: "bar", encoding: { x: "date", y: ["a", "b"], series: "region" } };
    expect(validateChartSpec(spec).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "encoding_conflict", path: "encoding.series" })]),
    );
    expect(validateChartSpec({ kind: "bar", encoding: { x: "d", y: ["a", "b"] } }).ok).toBe(true);
    expect(validateChartSpec({ kind: "bar", encoding: { x: "d", y: "a", series: "region" } }).ok).toBe(true);
  });

  it("rejects non-numeric values in value fields", () => {
    const spec = { kind: "line", encoding: { x: "date", y: "revenue" } };
    const result = validateChartSpec(spec, [{ date: "2026-01-01", revenue: "lots" }]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ code: "non_numeric_value", path: "rows[0].revenue" });
  });

  it("accepts numeric strings but rejects unparseable ones", () => {
    const spec = { kind: "line", encoding: { x: "date", y: "revenue" } };
    expect(validateChartSpec(spec, [{ date: "2026-01-01", revenue: "12.5" }]).ok).toBe(true);
    expect(validateChartSpec(spec, [{ date: "2026-01-01", revenue: "1,2" }]).errors[0]!.code).toBe(
      "non_numeric_value",
    );
  });

  it("enforces strict ISO 8601 when xType is time", () => {
    const spec = { kind: "line", xType: "time", encoding: { x: "date", y: "revenue" } };
    expect(validateChartSpec(spec, [{ date: "2026-01-01T00:00:00Z", revenue: 1 }]).ok).toBe(true);
    const rejected = validateChartSpec(spec, [{ date: "2026/11/04", revenue: 1 }]);
    expect(rejected.ok).toBe(false);
    expect(rejected.errors[0]).toMatchObject({ code: "invalid_time", path: "rows[0].date" });
    expect(validateChartSpec(spec, [{ date: "not a date", revenue: 1 }]).errors[0]!.code).toBe("invalid_time");
  });

  it("skips row-level checks until data exists", () => {
    expect(validateChartSpec({ kind: "line", encoding: { x: "date", y: "revenue" } }).ok).toBe(true);
  });

  it("rejects more rows than the 5000 cap", () => {
    const spec = { kind: "kpi", encoding: { value: "v" } };
    const rows = Array.from({ length: MAX_CHART_ROWS + 1 }, (_, index) => ({ v: index }));
    const result = validateChartSpec(spec, rows);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ code: "too_many_rows", path: "rows" });
    expect(result.errors[0]!.message).toContain("5000");
  });

  it("validates table column references", () => {
    const spec = { kind: "table", encoding: { columns: ["name", "missing"] } };
    const result = validateChartSpec(spec, [{ name: "a" }]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({
      code: "unknown_field",
      path: "encoding.columns",
      available: ["name"],
    });
  });
});

describe("isIso8601", () => {
  it("accepts date and datetime forms", () => {
    expect(isIso8601("2026-11-04")).toBe(true);
    expect(isIso8601("2026-11-04T09:30:00Z")).toBe(true);
    expect(isIso8601("2026-11-04T09:30:00.123+08:00")).toBe(true);
  });

  it("rejects locale and loose forms", () => {
    expect(isIso8601("2026/11/04")).toBe(false);
    expect(isIso8601("Nov 4 2026")).toBe(false);
    expect(isIso8601("2026-13-40")).toBe(false);
  });
});
