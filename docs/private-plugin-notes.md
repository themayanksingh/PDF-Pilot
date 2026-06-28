# Private Plugin Notes

Last Updated: 2026-06-28

## Spend Storage Fields

Client storage keys:
- `spend-runs-v2`: recent run records (capped to 10, newest first)
- `spend-all-time-summary-v1`: accumulated all-time summary
- `export-scale`: last selected export raster scale
- `export-quality`: last selected export quality preset
- `import-quality`: last selected PDF import quality preset

Run record shape:
- `run_id` (string)
- `last_run_at` (ISO datetime string)
- `prompt_tokens` (number)
- `completion_tokens` (number)
- `total_tokens` (number)
- `total_cost_usd` (number)
- `total_cost_inr` (number)
- `fx_rate_usd_inr` (number | null)
- `model_breakdown` (array)

Model breakdown item:
- `model` (string)
- `prompt_tokens` (number)
- `completion_tokens` (number)
- `total_tokens` (number)
- `cost_usd` (number)
- `cost_inr` (number)

Backward compatibility:
- Normalizers accept missing fields and older key aliases (`runId`, `lastRunAt`, `totalCostUsd`, etc.).
- Missing numeric fields default to `0`.
- Missing arrays default to `[]`.

## Plugin/UI API Contract

UI -> plugin (`code.ts`):
- `get-dashboard-data`
- `record-run-spend` with payload:
  - `run` (run record shape above)

Plugin -> UI:
- `dashboard-data` with payload:
  - `recent_runs`: run record[]
  - `summary_last_10`: `{ total_cost_usd, total_cost_inr, total_tokens, count }`
  - `summary_all_time`: `{ total_cost_usd, total_cost_inr, total_tokens, count }`

Existing settings contract is unchanged:
- `get-settings`, `save-settings`, `settings-loaded`, `settings-saved`

Export settings contract:
- UI -> plugin: `get-export-settings`
- plugin -> UI: `export-settings-loaded` with `{ settings: { exportScale, exportQuality } }`
- UI -> plugin: `save-export-settings` with `{ exportScale, exportQuality }`

Import settings contract:
- UI -> plugin: `get-import-settings`
- plugin -> UI: `import-settings-loaded` with `{ settings: { importQuality } }`
- UI -> plugin: `save-import-settings` with `{ importQuality }`

PDF import placement contract:
- UI -> plugin: `import-pdf-pages` with:
  - `fileName` (string)
  - `pages` array containing `{ pageNumber, width, height, imageBase64 }`
- plugin -> UI:
  - `import-pdf-place-progress`
  - `import-pdf-complete`
  - `import-pdf-error`

PDF import is intentionally raster-only. The UI owns PDF parsing/rendering and the plugin sandbox owns Figma node creation.

## FX Cache Behavior

USD->INR source:
- `https://open.er-api.com/v6/latest/USD`

Cache:
- Stored in UI `localStorage` key `fx-usd-inr-cache-v1`
- Cache TTL default: `86400` seconds (daily)
- Cache payload:
  - `rate` (number)
  - `fetchedAt` (epoch ms)

On run completion:
- UI fetches/caches USD->INR.
- UI computes USD and INR totals + per-model costs.
- UI posts `record-run-spend` to plugin for persistence and aggregation.
