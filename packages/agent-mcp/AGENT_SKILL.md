# Vela Agent Skill: Desktop Surfaces & Charts

You can create and control widgets, charts, dashboards and notifications on the
Vela desktop through the MCP tools in this service. Every surface you create is
owned by your identity; you can only modify or remove surfaces you own.

## Tool map

| Tool | Use it for |
| --- | --- |
| `surface.create` / `surface.patch` / `surface.remove` / `surface.list` | Raw control of widgets, panels and windows |
| `chart.create` / `chart.patch` / `chart.pushData` | Declarative charts; data flows separately from the spec |
| `dashboard.apply` | Atomically switch a whole dashboard in one frame |
| `signal.publish` | Publish any value under your namespace (`agent.<owner>.<key>`) |
| `notify.push` | Desktop notification |
| `vfs.read` / `vfs.write` | File storage limited to `/AgentData/<your-owner>/**` |

## Chart kind selection

Pick the kind from the question you want the viewer to answer:

| Question | Kind | Required encoding | Optional |
| --- | --- | --- | --- |
| How does a value move over time? | `line` | `x`, `y` (field names) | `series`, `xType:"time"` |
| How do categories compare? | `bar` | `x`, `y` | `series` |
| How is a whole split into parts? | `pie` | `name`, `value` | |
| How close is a value to a limit? | `gauge` | `value`, `max` | |
| What is the current single number? | `kpi` | `value` | `decimals`, `yUnit` |
| What are the exact records? | `table` | `columns` (or none for all fields) | |
| How do two measures co-vary? | `scatter` | `x`, `y` | `xType:"time"` |

Rules:

- `encoding.y` is one field name or an array of field names (multi-series).
  `encoding.series` groups rows by a category field and is mutually exclusive
  with a multi-element `y`.
- `xType:"time"` requires strict ISO 8601 strings (`2026-11-04T09:30:00Z`);
  `2026/11/04` is rejected.
- Value fields must be numeric (numbers or numeric strings).

## ChartSpec JSON Schema

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["kind", "encoding"],
  "properties": {
    "kind": { "enum": ["line", "bar", "pie", "gauge", "kpi", "table", "scatter"] },
    "title": { "type": "string", "maxLength": 120 },
    "xType": { "enum": ["category", "time", "value"] },
    "decimals": { "type": "integer", "minimum": 0, "maximum": 8 },
    "yUnit": { "type": "string", "maxLength": 16 },
    "encoding": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "x": { "type": "string" },
        "y": { "type": ["string", "array"], "items": { "type": "string" } },
        "series": { "type": "string" },
        "name": { "type": "string" },
        "value": { "type": "string" },
        "columns": { "type": "array", "items": { "type": "string" } },
        "max": { "type": "number" }
      }
    }
  }
}
```

## Data contract

- Rows are plain objects: `[{ "date": "2026-01-01", "revenue": 12 }, …]`.
- **5000-row limit.** Larger sets are rejected with `too_many_rows`; aggregate
  or downsample before publishing.
- Spec and data are decoupled: `chart.patch` changes the shape without touching
  the data flow; `chart.pushData` refreshes every chart bound to the same
  `dataKey`.
- A chart waits for data: until you `chart.pushData`, it shows a waiting
  placeholder instead of an empty axis.

## Reference flow

```text
chart.create  { id:"trend", kind:"line", encoding:{x:"date", y:"revenue"}, dataKey:"daily", x:40, y:40, width:520, height:320 }
chart.pushData { dataKey:"daily", rows:[{"date":"2026-11-01","revenue":12}, {"date":"2026-11-02","revenue":18}] }
chart.patch   { id:"trend", spec:{ kind:"bar", encoding:{x:"date", y:"revenue"} } }
```

If a call fails, the error JSON contains `error`, `message` and usually `path`
plus `available` (valid field names) — fix the field and retry the same call.
