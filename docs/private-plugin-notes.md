# Private Plugin Notes

## Spend Storage Fields

Client storage keys:
- `spend-runs-v2`: recent run records (capped to 10, newest first)
- `spend-all-time-summary-v1`: accumulated all-time summary

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
