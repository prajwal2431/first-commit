---
name: google_sheets_reactive_proactive_flow
overview: Wire Google Sheets as a configurable data source, ensure each RCA/agent run and proactive monitor uses fresh sheet data, and integrate this into the existing data ingestion and proactive RCA flows.
todos:
  - id: frontend-google-sheets-source
    content: Extend data sources UI to support configuring a Google Sheets source with URL and domain
    status: pending
  - id: backend-datasource-model-update
    content: Update backend DataSource model to support kind='google_sheet' and sheet configuration fields
    status: pending
  - id: backend-google-sheets-client
    content: Implement Google Sheets client and mapping utilities to convert rows into internal records
    status: pending
  - id: refresh-on-agent-and-chat
    content: Hook Google Sheets refresh into /analysis and /chat flows before RCA/analysis runs
    status: pending
  - id: refresh-in-monitors-and-proactive
    content: Hook Google Sheets refresh into monitors orchestrator and proactive RCA service triggers
    status: pending
  - id: source-health-and-error-handling
    content: Add status tracking and error handling for Google Sheets sources in backend and show status in Sources UI
    status: pending
  - id: test-scenarios
    content: Test end-to-end flows ensuring reactive and proactive insights update when the Google Sheet changes
    status: pending
isProject: false
---

## Google Sheets Data Source & Proactive RCA Plan

### 1. UX & Data Model: Add Google Sheets as a Source

- **SourcesPage UX**: Extend the existing "Add Source" flow on the data sources page ([frontend/src/pages/SourcesPage.tsx]) and the add‑source modal ([frontend/src/components/sources/EcosystemAddSourceModal.tsx]) with a **"Google Sheets"** option.
- **Configuration fields**: For a Sheets source, capture at minimum:
  - **Display name** (e.g. "Shopify Orders Sheet")
  - **Sheet URL** (public or shared-to-service-account link)
  - **Sheet type / domain** (e.g. `Sales & Orders`, `Inventory & ERP`, `Marketing & Traffic`)
  - Optional: **tab name / range** if not using the default.
- **Backend model**: Extend the existing data source model ([backend/src/models/DataSource.ts] or equivalent) with:
  - `kind: 'google_sheet' | 'upload' | ...`
  - `config.sheetUrl: string`
  - Optional: `config.sheetRange`, `config.mappingProfile`.
- **Validation**: On save, perform basic URL validation on the frontend; on the backend, verify that the URL is present and `kind === 'google_sheet'` before accepting.

### 2. Backend Connector: Read Google Sheets on Demand

- **Sheets client utility**: Add a small client module (e.g. [backend/src/services/integrations/googleSheetsClient.ts]) that:
  - Uses a **Google service account** and the Google Sheets API to fetch rows given `sheetId`, `range`.
  - Wraps auth and errors behind a simple `fetchSheetRows(dataSource: DataSource): Promise<Row[]>` interface.
- **Auth & secrets**:
  - Store the service account JSON (or key) safely in environment variables or a secrets manager; do **not** expose it to the frontend.
  - Require that the configured Sheet is shared with that service account email.
- **Mapping to internal schema**:
  - For each domain (orders, inventory, etc.), define a lightweight mapping layer (e.g. [backend/src/services/ingestion/mapSheetToRetailRecords.ts]) that takes raw rows and returns typed records (`RetailRecord`, `InventoryRecord`, etc.).
  - Reuse or mirror the existing CSV ingestion logic where possible so downstream code (monitors, analysis) doesn’t have to care whether data came from CSV or Sheets.

### 3. Ensuring Fresh Data for Reactive Agent Calls

- **Context builder hook**: In the RCA context builder module described in the integration plan ([backend/src/services/rca/contextBuilder.ts] or similar), add a **pre‑step**:
  - Look up all active `google_sheet` sources for the current tenant.
  - For each source, call `fetchSheetRows` and map rows into the appropriate DB collections (`RetailRecord`, `InventoryRecord`, etc.) or into a **temporary in‑memory snapshot** used only for this request.
- **Strategy choice**:
  - **Simple v1**: On each analysis/chat call, **refresh Sheets into DB** for that tenant before computing `DashboardState`, anomalies, and RCA context.
  - **Alternative**: For large sheets, only refresh **summary aggregates** (e.g. last 7 days revenue by SKU) or use `updatedAt` + `ETag` to skip if unchanged.
- **Flow wiring**:
  - In the `/api/analysis/start` and `/api/chat/message` handlers ([backend/src/routes/analysis.ts], [backend/src/routes/chat.ts]):
    - Before calling `runFullAnalysis` or the RCAagent client, invoke a `refreshGoogleSheetsForTenant(tenantId)` helper that encapsulates the logic above.
  - Ensure this refresh is **tenant‑scoped** and has a reasonable timeout; if Sheets is unavailable, fall back to last ingested data and surface a warning in logs.

### 4. Ensuring Fresh Data for Proactive Monitors & Emails

- **Monitor entrypoint hook**: In the monitors orchestrator ([backend/src/services/monitors/computeAll.ts]), insert the same `refreshGoogleSheetsForTenant(tenantId)` call **before** running revenue, demand, inventory, and operations monitors.
- **Scheduled & signal‑triggered flows**:
  - For scheduled proactive briefs (cron/HTTP job) and signal‑triggered RCA described in the proactive plan, ensure that each job:
    - Determines its target `tenantId`.
    - Calls `refreshGoogleSheetsForTenant(tenantId)`.
    - Then runs `computeAllMonitors` and the Proactive RCA service.
- **Idempotency & load control**:
  - Cache the **last refresh time per Sheet per tenant**; if multiple triggers fire within a short window (e.g. 5–10 minutes), skip an extra refresh and reuse the latest data.
  - Log refresh duration and row counts to monitor performance and cost.

### 5. Proactive RCA Service Integration

- **Context alignment**: Make sure the Proactive RCA service described in your existing plan reads from the **same post‑refresh DB state** used by dashboard and analysis flows (i.e. `DashboardState`, `Anomaly`, aggregates built after ingesting Sheets).
- **Trigger sensitivity**:
  - Because Sheets can change at any time, the most recent edit will be reflected in the next:
    - Dashboard load (via monitor call + refresh),
    - Scheduled proactive brief run,
    - Or signal‑triggered RCA run.
- **User messaging**:
  - In proactive emails and in‑app briefs, optionally add a note like: "Insights computed on the latest Google Sheets snapshot" so users understand that their spreadsheet is the live source of truth.

### 6. Error Handling & UX Feedback

- **Source health**:
  - Track status per Sheets source (`ok`, `auth_error`, `not_found`, `rate_limited`) and surface that on the Sources page via `Tag` components.
- **Ingress errors**:
  - If a row fails mapping, log it and continue; optionally count and show "X rows skipped" in an internal metric.
- **Timeouts**:
  - Set hard timeouts on Sheets fetch so that one slow sheet does not block all RCA calls; consider a smaller row limit or incremental ingestion for very large sheets.

### 7. Testing Scenarios

- **Unit/integration tests**:
  - Single tenant with one orders sheet – confirm that a cell edit in the sheet changes Revenue At Risk and Live Signals after the next analysis or monitor run.
  - Multiple Sheets (orders + inventory) – confirm that both feed into RCA context.
  - Auth failure or revoked sharing – confirm graceful degradation and clear status on the Sources page.
- **Proactive path**:
  - Edit values in the sheet that cross a threshold, run the scheduled/triggered job, and verify that:
    - Monitors see the new values,
    - New signals are emitted,
    - Proactive brief and/or emails reflect the latest data.

