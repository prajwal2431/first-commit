# Implementation Summary: Backend Intelligence Layer

This document summarizes everything implemented to move from mock data to real, data-grounded decision intelligence. Use it for context in future chats.

---

## Root Cause of the Original Problem

The frontend showed mock/hardcoded data because:

1. **Upload flow only stored raw blobs** — `uploadController` called `ingestRawCsv`/`ingestRawExcel` (unstructured `RawIngestionRecord`) instead of the existing structured parsers.
2. **No downstream computation** — With no structured records in `OrderRecord`, `RetailRecord`, `InventoryRecord`, etc., the monitors and RCA pipeline had nothing to compute from.
3. **No backend APIs** — Dashboard, analysis, and chat had no endpoints; frontend used timeouts and hardcoded responses.

**Fix:** Wire structured parsers into uploads → compute monitors on ingestion → expose APIs → connect frontend to real data.

---

## What Was Implemented (by Phase)

### Phase 1: Data Ingestion Pipeline

| Item | Location | Purpose |
|------|----------|---------|
| Upload controller rewrite | `backend/src/controllers/uploadController.ts` | After raw ingestion, calls `parseRetailCsv`, `parseExcelFile`, or type-specific parsers; triggers `computeAllMonitors(orgId)` on success. |
| CSV data type on upload | `backend/src/routes/dataSources.ts` | Accepts optional `dataType` in body: `orders`, `inventory`, `retail`, `traffic`, `fulfilment`, `weather`, `auto`. |
| Traffic parser | `backend/src/services/parseTrafficCsv.ts` | Parses sessions, impressions, clicks, spend by date/channel; inserts into `TrafficRecord`. |
| Fulfilment parser | `backend/src/services/parseFulfilmentCsv.ts` | Parses order_id, dispatch/delivery dates, delay_days, carrier, warehouse, region, status; inserts into `FulfilmentRecord`. |
| Weather parser | `backend/src/services/parseWeatherCsv.ts` | Parses date, region, temp_min/max, rainfall_mm, humidity; inserts into `WeatherRecord`. |
| Festival calendar | `backend/src/data/festival_calendar.json` | Static list of Indian festivals (date, name, region, intensity 1–5). Used by demand-spike and hypothesis tests. |
| New models | `backend/src/models/` | `TrafficRecord`, `FulfilmentRecord`, `WeatherRecord`, `DashboardState`, `AnalysisSession`. |
| Sample data generator | `backend/src/scripts/generateSampleData.ts` | Generates 45 days of retail, orders, inventory, fulfilment, traffic for org `default` and sourceId `sample-data`; includes deliberate anomalies (stockouts, traffic spikes). |

### Phase 2: Monitor Compute Layer

| Item | Location | Purpose |
|------|----------|---------|
| Revenue at risk | `backend/src/services/monitors/revenueAtRisk.ts` | WoW/DoD revenue deltas, decomposition, top SKU contributors, traffic–revenue gap signals. |
| Inventory exposure | `backend/src/services/monitors/inventoryExposure.ts` | OOS by SKU/location, demand–inventory region mismatch, exposure scores. |
| Operational breakdowns | `backend/src/services/monitors/operationalBreakdowns.ts` | SLA adherence, return rate, cancel rate, carrier/region blame. |
| Demand spikes | `backend/src/services/monitors/demandSpikes.ts` | 2-sigma spike detection, festival/weather classification. |
| Orchestrator | `backend/src/services/monitors/computeAll.ts` | Runs all four monitors in parallel, upserts `DashboardState` by `organizationId`. |

### Phase 3: RCA Pipeline (Anomaly → Hypotheses → Root Causes → Actions)

| Item | Location | Purpose |
|------|----------|---------|
| Anomaly detection | `backend/src/services/analysis/anomalyDetector.ts` | Threshold-based: revenue WoW/DoD, stockouts, CVR drops; writes `Anomaly` docs. |
| Hypothesis library | `backend/src/services/analysis/hypothesisLibrary.ts` | Eight templates (H1–H8): stockout, traffic drop, price/promo, CVR collapse, fulfilment, returns, festival, weather. |
| Hypothesis tester | `backend/src/services/analysis/hypothesisTester.ts` | Runs minimal data queries per hypothesis, evidence scoring, confound checks; returns `TestedHypothesis[]`. |
| Root cause ranker | `backend/src/services/analysis/rootCauseRanker.ts` | Ranks by contribution × confidence, builds evidence chain, computes business impact and geo opportunity. |
| Action generator | `backend/src/services/analysis/actionGenerator.ts` | Maps root causes to actions (replenish, escalate, investigate) with priority, effort, impact, owner. |
| Narrator | `backend/src/services/analysis/narrator.ts` | Template-based memo markdown and chat response from RCA result (no LLM required). |
| Run analysis | `backend/src/services/analysis/runAnalysis.ts` | Full flow: query data → detect anomalies → get applicable hypotheses → test → rank → actions → memo; updates `AnalysisSession` and supports progress callback for SSE. |

### Phase 4: API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/dashboard` | Returns `revenueAtRiskSeries`, `liveSignals`, `kpiSummary`, `lastComputedAt` for tenant. |
| POST | `/api/dashboard/refresh` | Triggers `computeAllMonitors(orgId)`, returns updated dashboard state. |
| POST | `/api/analysis/start` | Body: `{ query, signalId? }`. Creates `AnalysisSession`, runs `runFullAnalysis` in background, returns `analysisId`. |
| GET | `/api/analysis/stream/:id` | SSE stream of `progress` and `complete` (or `error`) for analysis. |
| GET | `/api/analysis/result/:id` | Full analysis result: root causes, business impact, actions, geo opportunity, charts, memo. |
| GET | `/api/analysis/sessions` | List recent analysis sessions for tenant. |
| POST | `/api/chat/message` | Body: `{ message }`. Data-grounded responses: runs analysis for “why” queries, or answers inventory/revenue/returns from DB. |

All dashboard/analysis/chat routes are protected with `requireAuth` (JWT); tenant from `req.user.tenantId`.

### Phase 5: Frontend Wiring

| Item | Location | Change |
|------|----------|--------|
| Dashboard store | `frontend/src/stores/dashboardStore.ts` | Fetches from `GET /api/dashboard`; `refreshDashboard` calls POST refresh. No mock delay or fake data. |
| Diagnosis store | `frontend/src/stores/diagnosisStore.ts` | `startDiagnosis` calls `POST /api/analysis/start`, then opens SSE to `/api/analysis/stream/:id`; on `complete`, applies result to root cause, impact, actions, geo, chartData. `fetchResult` polls `/api/analysis/result/:id` if needed. |
| Chat store | `frontend/src/stores/chatStore.ts` | `sendMessage` calls `POST /api/chat/message`; displays real API response. |
| Session store | `frontend/src/stores/sessionStore.ts` | `fetchSessions` calls `GET /api/analysis/sessions`; maps to `Session[]`. |
| Revenue at Risk chart | `frontend/src/components/dashboard/RevenueAtRiskChart.tsx` | Uses `revenueAtRiskSeries` and `kpiSummary` from store; empty state when no data. |
| Live Signals feed | `frontend/src/components/dashboard/LiveSignalsFeed.tsx` | Uses `liveSignals` from store; click triggers `POST /api/analysis/start` with `suggestedQuery` and navigates to diagnosis. |
| Diagnosis search bar | `frontend/src/components/dashboard/DiagnosisSearchBar.tsx` | Submit calls `POST /api/analysis/start` and navigates to `/dashboard/diagnosis/:analysisId?q=...`. |
| Root Cause card | `frontend/src/components/diagnosis/RootCauseCard.tsx` | Uses `chartData.revenueVsTraffic` from store for chart when available; no hardcoded `EXTERNAL_FACTORS`. |
| Analysis progress | `frontend/src/components/diagnosis/AnalysisProgress.tsx` | Uses `analysisSteps` from store when present; else default step labels. |
| Diagnosis page | `frontend/src/pages/DiagnosisPage.tsx` | Renders geo card only when `geographicData` is non-null; handles error state. |
| Sources upload | `frontend/src/stores/sourcesStore.ts` | Upload sends optional `dataType` in FormData. |

Empty states: when there is no data, dashboard and live signals show “No data yet” / “No signals detected” and prompt to connect a data source.

---

## Where the Generated Data Lives

### 1. MongoDB (primary source of truth)

After running the sample data generator, all generated data is stored in your MongoDB database. Connection string is in `backend/.env` as `MONGODB_URI` (e.g. MongoDB Atlas).

**Collections populated by the script:**

| Collection | Contents |
|------------|----------|
| `retail_records` | Daily retail metrics (date, sku, revenue, units, traffic, inventory, returns) for org `default`, sourceId `sample-data`. |
| `orders` | Order-level data (order_id, sku, quantity, revenue, date, region). |
| `inventory` | SKU × location × date snapshots (available_qty). |
| `fulfilment_records` | Dispatch/delivery, delay_days, carrier, warehouse, region, status. |
| `traffic_records` | Sessions, impressions, clicks, spend by date and channel. |
| `dashboard_states` | Computed dashboard for `organizationId: 'default'` (revenue series, live signals, kpiSummary). |

To “find” this data in future chats:

- **Inspect in MongoDB:** Use MongoDB Compass or Atlas UI, connect with your `MONGODB_URI`, open database `decision-intelligence` (or the name in your URI), and browse the collections above.
- **Query via backend:** Use existing APIs (e.g. `GET /api/dashboard`, `POST /api/chat/message` with “What is our return rate?”) or add small debug/export routes that read from these collections.

### 2. Regenerating the sample data

To recreate or refresh the sample dataset:

```bash
cd backend
npx ts-node src/scripts/generateSampleData.ts
```

This script:

- Deletes existing records for `sourceId: 'sample-data'` in retail, orders, inventory, fulfilment, traffic.
- Inserts new 45-day synthetic data (including anomalies for STITCH-TEE-OVR, traffic spikes, etc.).
- Upserts a `DataSource` with `fileName: 'sample-data-generator'`.
- Calls `computeAllMonitors('default')` so `dashboard_states` is up to date.

So the “place” you find the data for future use is: **MongoDB**, and the **script** to regenerate it is `backend/src/scripts/generateSampleData.ts`.

### 3. Exporting data for re-upload (optional)

If you want CSV/Excel files to re-upload later via the app:

- You can add a small script (e.g. under `backend/src/scripts/`) that reads from `retail_records`, `orders`, etc., and writes CSV files to a folder like `backend/data/exports/`. That folder would then be the “place” you find the generated files for future chats. This export script was not implemented; only the generator that writes to MongoDB exists.

---

## Quick Reference: Key Files

- **Config:** `backend/.env` (MongoDB, JWT); `frontend` uses `VITE_API_BASE_URL` (default `http://localhost:3000/api`).
- **Auth:** JWT in `Authorization: Bearer <token>`; tenant from `req.user.tenantId` (e.g. `default`).
- **Run backend:** `cd backend && npm run dev`
- **Run frontend:** `cd frontend && npm run dev`
- **Generate sample data:** `cd backend && npx ts-node src/scripts/generateSampleData.ts`
- **Data location:** MongoDB collections listed above; regenerate with the script in §2.

Use this file in future chats to restore context on what is already implemented and where the generated data lives.
