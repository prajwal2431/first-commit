# 7-Day Prototype Task List — Agentic Decision Intelligence Platform

Use this file to track progress. Check off items as you complete them.

---

## Progress summary

| Day | Focus | Status |
|-----|--------|--------|
| Day 1 | Project setup & backend skeleton | ⬜ Not started |
| Day 2 | Data intake (upload + parsers) | ⬜ Not started |
| Day 3 | Normalization + anomaly detection | ⬜ Not started |
| Day 4 | Agentic RCA core (Bedrock + hypotheses) | ⬜ Not started |
| Day 5 | Actions + SSE + API wiring | ⬜ Not started |
| Day 6 | Frontend dashboard & real-time UI | ⬜ Not started |
| Day 7 | Chat, polish & integration | ⬜ Not started |

---

## Day 1 — Project setup & backend skeleton

**Goal:** Repo structure, tooling, DB connection, and core data models in place.

### 1.1 Repository & tooling
- [ ] Initialize monorepo or separate `backend/` and `frontend/` folders
- [ ] Backend: Node.js + Express + TypeScript (tsconfig, scripts in `package.json`)
- [ ] Frontend: Vite + React + TypeScript (create app, add scripts)
- [ ] Add ESLint + Prettier (shared or per package)
- [ ] Add `.env.example` with placeholders (e.g. `MONGODB_URI`, `AWS_REGION`)

### 1.2 Backend skeleton
- [ ] Express app entry point (e.g. `src/index.ts` or `server.ts`)
- [ ] Health check route: `GET /health` returning `{ status: "ok" }`
- [ ] Basic middleware: `express.json()`, CORS, request logging
- [ ] Folder structure: `routes/`, `services/`, `models/`, `utils/`, `config/`

### 1.3 Database & models
- [ ] MongoDB connection (e.g. Mongoose or native driver), config from env
- [ ] Define core schemas/models:
  - [ ] `DataSource` (file metadata, status, userId, organizationId)
  - [ ] `OrderRecord` (order_id, sku, quantity, revenue, date, region)
  - [ ] `InventoryRecord` (sku, location, available_qty, date)
  - [ ] `Anomaly` (kpiName, severity, status, deviationPercent, dimensions)
  - [ ] `Hypothesis`, `RootCause`, `Action` (minimal fields for Day 4–5)
- [ ] Add indexes for `orders` (sku, date, region), `inventory` (sku, location, date), `anomalies` (status, detectedAt)

### 1.4 Frontend shell
- [ ] Vite React app runs without errors
- [ ] Install and wire: React Router (optional for Day 1), Tailwind CSS
- [ ] Placeholder layout: sidebar + main content area (empty)
- [ ] Optional: add shadcn/ui and render one dummy component

**Day 1 done when:** Backend starts, `/health` works, DB connects, models exist; frontend builds and shows a simple layout.

---

## Day 2 — Data intake (upload + parsers)

**Goal:** Users can upload Excel/CSV files; data is parsed and stored.

### 2.1 File upload API
- [ ] `POST /api/data-sources/upload` — multipart form, accept `.xlsx`, `.csv`
- [ ] Validate file size (e.g. max 10MB for prototype)
- [ ] Save file to disk or stream to parser; create `DataSource` document with status `processing`
- [ ] Return `{ dataSourceId, status: "processing" }` and optionally poll or use webhook later

### 2.2 Parsers
- [ ] **Excel:** Use `xlsx`; parse first sheet (or configurable), convert to array of objects; handle basic types (numbers, dates)
- [ ] **CSV:** Use `csv-parse`; support comma/delimiter detection, quoted fields
- [ ] After parse: determine data type (orders vs inventory) by column names (e.g. presence of `order_id` + `revenue` vs `sku` + `available_qty`)
- [ ] Map parsed rows to `OrderRecord` or `InventoryRecord`; insert in bulk into MongoDB
- [ ] Update `DataSource` status to `completed` or `failed`; store `recordCount` and optional `errorMessage`

### 2.3 Error handling
- [ ] Invalid format → 400 with clear message
- [ ] Parse errors → mark `DataSource` as `failed`, store error message; do not store partial data for MVP
- [ ] Log errors for debugging

### 2.4 Optional frontend
- [ ] Simple upload page: file input + “Upload” button
- [ ] Call `POST /api/data-sources/upload`, show success/error and data source ID

**Day 2 done when:** Uploading an Excel or CSV with orders/inventory results in records in DB and data source status updated.

---

## Day 3 — Normalization & anomaly detection

**Goal:** Unified schema for columns + detection of revenue drop and stockout anomalies.

### 3.1 Normalization (simplified for 7-day)
- [ ] Define standard column names for orders and inventory (see `design.md`)
- [ ] Schema mapper: map uploaded columns to standard names (exact match first; optional: fuzzy or allow manual mapping later)
- [ ] If required fields missing, mark data source with quality issues and list missing fields
- [ ] Data validator: check types (e.g. revenue number, date parseable), flag duplicates by composite key (e.g. order_id + sku + date)
- [ ] Store normalized records with `sourceId` and `organizationId` for multi-tenant readiness

### 3.2 Anomaly detection — revenue
- [ ] KPI job or endpoint: compute revenue by day and by week (from `OrderRecord`)
- [ ] Baseline: previous day (DoD), previous week (WoW)
- [ ] If current period revenue &lt; baseline by &gt; 10% (DoD) or &gt; 15% (WoW), create `Anomaly` with kpiName `Revenue`, severity from deviation band (e.g. &gt;25% → critical)
- [ ] Support dimensions: e.g. region, or “overall”

### 3.3 Anomaly detection — stockout
- [ ] From `InventoryRecord`, detect SKU+location where `available_qty === 0` (or below threshold)
- [ ] Optionally correlate with recent order velocity (orders in last 7 days for that SKU) to prioritize
- [ ] Create `Anomaly` with kpiName `Inventory` / `Stockout`, severity (e.g. top-SKU vs others)
- [ ] Timestamp detection and set status `detected`

### 3.4 Anomaly API
- [ ] `GET /api/anomalies` — list anomalies (filter by status, severity, date range)
- [ ] `GET /api/anomalies/:id` — single anomaly with dimensions and values
- [ ] Trigger: either cron-like job or “Run detection” endpoint that runs revenue + stockout checks and persists anomalies

**Day 3 done when:** Normalized data is stored; running detection creates revenue and stockout anomalies; API returns them.

---

## Day 4 — Agentic RCA core (Bedrock + hypotheses)

**Goal:** For each anomaly, generate hypotheses, test with data, rank root causes, store audit trail.

### 4.1 AWS Bedrock setup
- [ ] AWS SDK (or Bedrock client) in backend; config: region, model (Claude 3.5 Sonnet)
- [ ] Secure credentials (env vars or IAM role); no keys in code
- [ ] Test: simple invoke returning text or structured JSON

### 4.2 Hypothesis generation
- [ ] Input: anomaly (type, severity, dimensions, current vs expected value)
- [ ] Gather context: top SKUs, recent inventory changes, sample order counts (from DB)
- [ ] Prompt Claude to generate 3–5 testable hypotheses; use structured output (JSON) for list of `{ description, expectedEvidence, testCriteria }`
- [ ] Save each as `Hypothesis` with status `pending`, link to `anomalyId`

### 4.3 Hypothesis testing
- [ ] For each hypothesis, define test criteria (e.g. “query orders for SKU X in last 7 days”)
- [ ] Execute queries against MongoDB (orders, inventory); get counts/aggregates
- [ ] Compare results to expected evidence; assign evidence score (e.g. 0–1)
- [ ] Update hypothesis status to `confirmed` or `rejected` and set `confidenceScore`
- [ ] Store evidence (data source, query, result) for audit

### 4.4 Root cause ranking & explanation
- [ ] From confirmed hypotheses, rank by confidence × business impact
- [ ] Create `RootCause` records: description, confidenceScore, contributingFactors, evidenceChain
- [ ] Optional: second Bedrock call to generate short English summary and reasoning
- [ ] Store audit log entries: hypothesis_generated, hypothesis_tested, root_cause_identified

### 4.5 RCA API
- [ ] `POST /api/anomalies/:id/analyze` — trigger RCA for one anomaly (generate → test → rank → save)
- [ ] `GET /api/anomalies/:id/rca` — return root causes, hypotheses, evidence chain, audit trail

**Day 4 done when:** Triggering analysis on an anomaly produces hypotheses, tested hypotheses, ranked root causes, and an auditable trail.

---

## Day 5 — Actions, SSE & API wiring

**Goal:** Actions generated from root causes; real-time updates via SSE; core APIs ready for frontend.

### 5.1 Action generation
- [ ] When root cause is confirmed, map to action types:
  - Stockout → `replenish_inventory`
  - Fulfilment/ops → `escalate_ops_issue`
  - Listing/traffic → `investigate_sku_listing`
- [ ] Create `Action`: title, description, priority (from severity + impact), suggestedOwner (from config or default), context (sku, region, etc.), link to rootCauseId and anomalyId
- [ ] Priority calculator: urgent/high/medium/low
- [ ] Optional: configurable role mapping (action type → default owner)

### 5.2 Action API
- [ ] `GET /api/actions` — list actions (filters: status, priority, assignedOwner)
- [ ] `PATCH /api/actions/:id` — update status (e.g. in_progress, completed, dismissed), assign owner
- [ ] `GET /api/actions/:id` — single action with root cause and anomaly summary

### 5.3 SSE (Server-Sent Events)
- [ ] Endpoint: `GET /api/events` or `GET /api/sse` — keep connection open, send events
- [ ] Event types: `anomaly_detected`, `rca_completed`, `action_created` (and optionally `action_updated`)
- [ ] When anomaly is created, RCA completed, or action created, push event to connected clients (in-memory store of client connections or simple pub/sub)
- [ ] Heartbeat every 30s to keep connection alive; support reconnect (e.g. Last-Event-ID)
- [ ] CORS and no-cache headers for SSE route

### 5.4 Workflow wiring
- [ ] After anomaly detection, optionally auto-trigger RCA (or leave for “Analyze” button)
- [ ] After RCA completes, auto-create actions from root causes
- [ ] Emit SSE events at each step so dashboard can update in real time

**Day 5 done when:** Root causes produce actions; action CRUD works; SSE stream sends events when anomalies/RCA/actions change.

---

## Day 6 — Frontend dashboard & real-time UI

**Goal:** Dashboard showing anomalies, root causes, actions, and KPI trend; real-time updates via SSE.

### 6.1 Setup & state
- [ ] Install: shadcn/ui, Tremor (or similar) for charts, Zustand
- [ ] Zustand store: anomalies, rootCauses, actions, kpiTrends, lastUpdated; actions to set/append and clear
- [ ] SSE client: connect to `GET /api/sse`, on message parse event and update Zustand store; reconnect with backoff on disconnect

### 6.2 Dashboard layout
- [ ] Layout: sidebar (nav: Dashboard, Data, Settings if needed) + main content
- [ ] Dashboard route as default; clean, “premium” look (e.g. card-based, clear typography)

### 6.3 Alerts / anomalies widget
- [ ] List active anomalies (status not resolved/dismissed)
- [ ] Show: KPI name, current vs expected value, deviation %, severity badge
- [ ] Click row/card → navigate to anomaly detail or expand inline to show RCA summary
- [ ] Optional: “Run detection” button that calls backend and then relies on SSE for new anomalies

### 6.4 Root causes / issues widget
- [ ] List root causes (e.g. for selected anomaly or latest)
- [ ] Show: description, confidence score, contributing factors summary
- [ ] Link to related actions

### 6.5 Actions widget
- [ ] List actions with priority and owner
- [ ] Show: title, priority, status, suggested/assigned owner, due date if any
- [ ] Actions: mark in progress, complete, dismiss; assign owner (dropdown or input)
- [ ] Call `PATCH /api/actions/:id` and refresh or rely on SSE

### 6.6 KPI trends chart
- [ ] Fetch or compute revenue trend (e.g. daily/weekly) from API
- [ ] Tremor (or Recharts) line/area chart; highlight anomaly detection points if possible
- [ ] Optional: drill-down by region or SKU (can be stub for prototype)

### 6.7 Anomaly detail & RCA view
- [ ] Page or modal: anomaly + full RCA (hypotheses, evidence, root causes, audit trail)
- [ ] Show confidence scores and reasoning summary

**Day 6 done when:** Dashboard shows anomalies, issues, and actions; SSE updates list in real time; KPI chart renders; anomaly detail shows RCA.

---

## Day 7 — Chat, polish & integration

**Goal:** Basic chat for queries; error handling and polish; end-to-end smoke test.

### 7.1 Chat interface (minimal)
- [ ] Chat UI: message list + input; send button or Enter
- [ ] `POST /api/chat` or `/api/query`: send user message; optional conversation id for context
- [ ] Backend: use Bedrock to interpret intent (KPI, anomaly, SKU, actions); route to:
  - KPI value/trend → query DB, return numbers
  - Anomaly/RCA → return summary from stored anomaly/root cause
  - SKU → inventory + orders summary
- [ ] Response: plain text or structured (e.g. markdown); include citations (e.g. “Based on orders data”) where relevant
- [ ] Store or pass last N messages for context (e.g. 5)

### 7.2 Data upload in UI
- [ ] If not done on Day 2: upload page with drag-drop or file picker; show list of data sources and status
- [ ] Link from dashboard to “Upload data” and “Data sources”

### 7.3 Error handling & UX
- [ ] API errors: show toast or inline message; avoid silent failures
- [ ] Loading states: skeletons or spinners for dashboard widgets and chat
- [ ] Empty states: “No anomalies”, “Upload data to get started”

### 7.4 Auth (minimal for prototype)
- [ ] Optional: simple API key or single-user auth so only authorized client can call APIs
- [ ] Or: stub “user” and “organizationId” in backend for all requests (document in README)

### 7.5 Integration & docs
- [ ] End-to-end: upload file → run detection → run RCA → see anomaly + root cause + actions on dashboard; update action; see update via SSE
- [ ] README: how to run backend and frontend; env vars; optional 7-day summary and link to `TASKS.md`
- [ ] `.env.example` updated with all required variables

**Day 7 done when:** Chat answers at least KPI and anomaly questions; dashboard and upload are usable; one full flow works; README is clear for preview and run.

---

## Quick reference — key deliverables by day

| Day | Deliverable |
|-----|-------------|
| 1 | Backend + frontend run; DB + models; health check |
| 2 | Upload Excel/CSV → parsed and stored; data source status |
| 3 | Normalized data; revenue & stockout anomalies; anomaly API |
| 4 | RCA: hypotheses → test → root causes; Bedrock + audit |
| 5 | Actions from root causes; action API; SSE stream |
| 6 | Dashboard: anomalies, issues, actions, chart; SSE live updates |
| 7 | Chat (KPI/anomaly/SKU); polish; E2E flow; README |

---

## Notes

- **Scope:** This is a 7-day prototype. Defer: full schema mapping UI, Cognito, multi-tenant org switching, export PDF/CSV, property-based tests.
- **Tracking:** Update the “Progress summary” table at the top and check off tasks as you go.
- **Docs:** See `docs/overview.md`, `design.md`, and `requirements.md` for full product and design context.
