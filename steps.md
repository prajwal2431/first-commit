## 0) The key design decision (to avoid wrong assumptions)

You’re adding weather + festive. Don’t treat them as “random extra fields” — treat them as **Contextual Data Providers** (your PDF explicitly includes “contextual data providers (weather, news)” in the use case diagram). 

That means:

* Weather + festive are **optional, pluggable sources**
* They **never override** internal metrics; they only:

  1. explain variance (lift/downturn),
  2. help de-confound (e.g., demand spike wasn’t “product genius” alone),
  3. improve action urgency/ROI.

---

# A) Product persona (Bonkers Corner) and ROI lens

**Persona you’re really selling to:** an “Ops+Growth lead” at an Indian D2C brand who has:

* Shopify/website + marketplaces, a WMS/ERP, logistics partners
* daily firefighting: stockouts, spikes, delivery issues, returns
* needs “what to do next” faster than analytics dashboards.

Your PDF’s USP is literally: **“We turn business anomalies into owned actions — not charts.”** 
So your MVP must prove:

1. it detects something early,
2. it diagnoses credibly (evidence trace),
3. it recommends actions with impact range,
4. it pushes those actions to teams (email/task ID). 

---

# B) The 4 monitors: what they compute + what they show on UI

These are your “always-on behind the scenes” jobs. They drive **Dashboard cards + Live Signals**, so the chat never starts “cold”. 

## 1) Revenue at risk (Dashboard: “Revenue at Risk” chart)

**Backend outputs**

* Primary KPI deltas: Revenue, Units, Orders, AOV, CVR (if traffic exists) 
* Decomposition where possible: Revenue ≈ Sessions × CVR × AOV (traffic optional)
* Segment localization: top SKUs/regions/channels contributing to negative delta 

**UI mapping**

* “Revenue at Risk” area chart = `revenue vs traffic` (or revenue vs baseline if no traffic)
* “Rev vs Traffic Gap” stat = computed decomposition gap
* A “DROP DETECTED” tag comes from anomaly detector status 

## 2) Inventory exposure (Sidebar signal + card like “OOS / stuck inventory”)

**Backend outputs**

* OOS rate changes, days-of-cover estimates, “stock trapped elsewhere” checks 
* Exposure score = how much revenue is blocked by OOS on high-demand segments

**UI mapping**

* Live signal examples: “Stockout spike for SKU in Delhi”
* “Geo Opportunity” card = demand region vs inventory region mismatch

## 3) Operational breakdowns (returns/cancels/SLA)

**Backend outputs**

* SLA drop, cancel spike, return spike (and if you have carrier/warehouse dimension: blame localization) 

**UI mapping**

* Live signal: “Marketplace sync latency / SLA drop / returns surge”
* “Business Impact” card includes conversion drop, cancel/return KPIs

## 4) Demand spikes (festive + weather become first-class here)

**Backend outputs**

* demand spike detection (units/orders + traffic if present)
* classification: “organic product pull” vs “festival-driven” vs “weather-driven” vs “campaign-driven”
* leading indicators: weather shift + festival window around the spike

**UI mapping**

* Live signals: “Demand spike: Winterwear in North due to temp drop” / “Festive lift: Diwali week”
* Root cause narrative cites these context drivers as evidence (not vibes)

---

# C) How weather + festive plug into RCA (without blowing up scope)

## C1) Data model additions (minimal, powerful)

Add 2 canonical tables to your “schema unification” layer (same place as orders/inventory/traffic/SLA mentioned in PDF). 

### `weather_fact` (daily)

* `date, region(city/state), temp_min, temp_max, rainfall_mm, humidity(optional)`
* Derived features: `temp_drop_7d`, `rain_spike`, `feels_like_shift` (keep simple)

### `festival_calendar`

* `date, festival_name, region(optional), intensity_score(1-5)`
* Derived features: `is_festival_week`, `days_to_festival`, `festival_cluster` (Diwali/Eid/Christmas etc.)

**MVP hack:** store festival calendar as a static JSON you ship with the app; weather can be either:

* uploaded CSV (fastest), OR
* fetched once per region per day by a “context ingestion” endpoint (still okay for hackathon if simple).

## C2) Hypotheses you add to the hypothesis library

Your PDF’s hypothesis stage already includes confounds and minimal tests. Extend the library with 2 hypotheses and deterministic tests. 

### H7: Festival-driven demand shift

Evidence checks:

* uplift concentrated during `is_festival_week`
* repeatability: compare same festival window last year (if exists) or pre/post window delta
* segment match: categories/SKUs historically sensitive (you can infer from data: “top contributors during festivals”)

### H8: Weather-driven category lift

Evidence checks:

* correlation between weather feature (temp drop / rain spike) and sales for relevant category/SKU group
* localization: region where weather changed is where sales changed
* confound check: not explained by price/promo/stockouts first

These “contextual” hypotheses should be **ranked alongside** stock/traffic/ops causes using the same scoring: **contribution + confidence + evidence trace** .

---

# D) End-to-end workflow: tenant → data sources → monitors → chat → email

This mirrors your use case diagram: **Analyze multi-source data → perform RCA via chatbot → visualize results → view proactive alerts → act on recommendations**, with contextual providers included. 

## D1) Login / tenant

MVP-level:

* Cognito optional, but your PDF includes it; if you skip, still architect with `tenant_id` everywhere. 

## D2) Data Sources tab (“Connected Grounding Sources”)

Backend processes behind each tile:

* **Connect integration** (MVP: upload-based connectors):

  * Shopify export CSV
  * WMS inventory CSV
  * Meta Ads/traffic CSV
  * Logistics/SLA CSV
  * Weather CSV (or “fetch weather for regions in dataset”)
  * Festival calendar auto-attached (no upload)
    This matches “Excel/CSV uploads” and “marketplace/API connectors” conceptually, but keeps scope sane. 

For each “Connected Source” card in UI:

* store a `connector_state` record: status, lastSync, schema mapping, last ingestion job ID.

## D3) Always-on monitors (the “current happenings” dashboard)

Implement as “run-on-ingestion + scheduled refresh”:

* On every new dataset ingestion: recompute all monitors and store `latest_dashboard_state`
* Optionally every X minutes: rerun monitors on most recent dataset (for hackathon, this can be a manual “Refresh” button)

This is faithful to “KPI monitoring with segment localization” and the proactive monitoring idea. 

## D4) Chat query (“Why is revenue dropping … despite high traffic?”)

This is exactly your demo question pattern. 
Backend flow must follow your process diagram:

* Detect anomaly → generate hypotheses → run minimal tests → rank root causes → recommend actions → explain & export memo 

## D5) Emailing action plan to logged-in user

Your PDF already has “send associated task ID to the appropriate team for execution, in one click.” 
For MVP: replace “task system” with:

* **Action email** to the user’s login email (and optionally CC team emails configured in settings)
* Include: Summary, RCA top 3, actions with priority/effort/impact, evidence bullets, links back to the analysis session.

---

# E) Front-end ↔ back-end integration: concrete contracts (what each UI component needs)

Your tech stack slide suggests:

* Frontend: React/Vite, Tremor for charts, Zustand 
* Backend: Express.js (TS), REST API + SSE 
* Agents/LLMs: AWS Bedrock, “aws strandards agents sdk (Typescript)” 
* DB: MongoDB 

### 1) Dashboard load

`GET /v1/dashboard?tenant_id=...`
Returns:

* `revenueAtRiskSeries[]`
* `liveSignals[]` (each has `severity`, `monitor_type`, `suggested_query`, `evidence_snippet`)
* `lastComputedAt`

### 2) Live signal click → analysis run

When user clicks a signal:

* FE calls `POST /v1/analysis/start` with `{tenant_id, query, context: {signal_id}}`
* BE returns `{analysis_id}`

### 3) “Synthesizing Intelligence” stage (SSE)

`GET /v1/analysis/stream/:analysis_id` (SSE)
Send events aligned to your 4-stage UI:

* `stage=01` “Querying data tables” (orders/inventory/traffic/weather/festival) 
* `stage=02` “Analyzing signals” (KPI change + segment localization) 
* `stage=03` “Correlating / confound checks” (minimal tests) 
* `stage=04` “Generating action plan + memo” 

### 4) Result page payload (what populates your cards)

`GET /v1/analysis/result/:analysis_id`
Return structure:

* `rootCauses[]`: `{title, contribution, confidence, evidence: {...}, monitor_type}`
* `businessImpact`: `{lost_rev_estimate, conversion, oos, sla, ...}`
* `charts`: series needed for your right-side charts
* `actions[]`: `{title, priority, effort, expectedImpactRange, ownerSuggestion, emailReadyText}`
* `memoMarkdown`: for export / email

### 5) Email action plan

`POST /v1/analysis/email/:analysis_id`
Body: `{to: user_email, cc?:[], include_memo:true}`
BE sends email and stores `email_log` row.

---

# F) Back-end processes by module (what you build, in order)

This maps directly to your “Agentic engine features & capabilities”. 

## F1) Data Intake (uploads first)

* `/v1/connectors/upload` supports CSV/XLSX
* store raw file metadata
* run column mapping + schema unification + missing handling (Normalization & Quality Layer). 

## F2) Normalization & Quality Layer (critical for “adaptability”)

Make adaptability real by implementing:

* Canonical schema + “mapping profile” per tenant/source
* “Required fields per monitor” validation:

  * Revenue at risk: orders required
  * Inventory exposure: inventory required
  * Operational breakdowns: SLA/returns/cancels optional but boosts confidence
  * Demand spikes: orders required; weather/festival optional

Return “what you can/can’t conclude” in outputs when data missing (this increases judge trust).

## F3) Anomaly Detection (per monitor)

Compute anomalies on:

* sales/units/CVR/AOV/OOS/returns/cancels/SLA 
  Store:
* anomaly objects per monitor
* localized top segments

## F4) Hypothesis & Test Orchestrator

Implement a deterministic planner (fast + reliable), not free-form:

* choose hypothesis templates based on monitor and available tables
* for each hypothesis, run minimal tests + confound checks 

Include your new context hypotheses:

* festival-driven lift
* weather-driven lift

## F5) Causal Scoring & Explainability

Use the PDF’s scoring principle:

* **Contribution + confidence + evidence trace** 
  And keep the evidence JSON extremely explicit, because it powers:
* the narrative
* the memo/email
* the audit trail

## F6) Action Recommendations & Memo

Generate:

* action list with priority/effort/impact range 
* memo with evidence trail (“Explain & export memo + evidence trail” in your process flow) 

## F7) Audit trail / governance (MVP lightweight)

Your architecture diagram calls for evidence store + audit trail/traceability. 
So store for each analysis:

* inputs used (tables + date range + filters)
* hypotheses considered + which tests executed
* final ranked causes + scores
  This is also your “anti-hallucination” story.

---

# G) 3-day “religious execution” plan (updated with weather/festive + email)

## Day 1: Ingestion + dashboard state

1. Build `/upload` ingestion for orders + inventory + traffic (optional) + weather (optional)
2. Implement schema mapping + data health report (Normalization/Quality) 
3. Implement monitor compute jobs:

   * Revenue at risk
   * Inventory exposure
   * Operational breakdowns
   * Demand spikes (festival flagging can be immediate)
4. Hook FE dashboard to `GET /dashboard`

**End of day demo:** upload dataset → dashboard shows “Revenue at Risk” chart + live signals.

## Day 2: RCA pipeline + SSE + results UI binding

1. Implement `/analysis/start`, `/analysis/stream` (SSE), `/analysis/result` 
2. Implement hypothesis library + minimal tests + confounds 
3. Add festival + weather hypotheses and evidence checks
4. Return payload aligned with your “Root Cause / Business Impact / Actions / Geo Opportunity” cards

**End of day demo:** click a live signal → see “Synthesizing” steps → result page fully populated.

## Day 3: Email + polish + judge narrative

1. Implement `/analysis/email/:analysis_id` and email template that includes:

   * RCA top causes (with confidence + contribution) 
   * actions with priority/effort/impact range 
   * evidence bullets + link to session
2. Add memo export (markdown download is enough; PDF export if time)
3. Add “Refresh dashboard” and “Connected sources status” updates
4. Script 3 judge questions:

   * Revenue drop despite high traffic (your demo) 
   * Inventory exposure: OOS in region with demand spike
   * Demand spike explained by festival/week + weather shift

---

# H) What “high quality + best practice” looks like in this MVP (no rework later)

* **Strict typed contracts**: zod schemas for every API response (prevents FE/BE drift).
* **Deterministic analytics, LLM for narration**: keeps you aligned with “evidence trace” and “owned actions” instead of hallucination. 
* **Graceful missing-data behavior**: when traffic/weather isn’t present, confidence drops and the model explains “not available” (this increases trust).
* **Single source of truth for computed state**: `dashboard_state` and `analysis_result` stored server-side (MongoDB aligns with your stack). 
