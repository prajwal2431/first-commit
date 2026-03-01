# Agentic Decision Intelligence Platform: Product Summary

This document provides a comprehensive summary of all components and features implemented across the frontend and backend of the Agentic Decision Intelligence Platform. This summary reflects the real-truth architecture, covering every functional area, data schema, UI component, and active system service.

## 1. Feature Highlights & Capabilities

### 1.1 Tenant Isolation & Authentication
- **Multi-Tenant Data Structure:** Complete data separation per organization/tenant through a `Tenant` model in MongoDB, ensuring that user sessions, ingested items, chats, and configurations do not cross-pollinate.
- **Login / Signup Layer:** Supported via dedicated pages using JWTs and AWS Cognito-inspired flows (or generic token auth wrappers in Node).
- **Session State Management:** The frontend `tenantStorage` and `sessionStore` guarantee chat histories and system configurations remain bound to the active logged-in tenant profile.

### 1.2 The Intelligence Hub (Chat UI)
- **Persistent Chat History:** The app leverages DB persistence mapping chats to tenants. It also utilizes cached `sessionStore` management so users can resume chats on page reload safely.
- **Chat Modularity:** You can rename, delete (with a sharp confirmation dialogue modal), and create new instances of chat conversations by pressing the `+` icon.
- **AI Signal Cards in Chat:** Replaced standard text elements with rich components for `Revenue At Risk` and `Live Signals`. These components pull computed threshold data and display visual decomposition and driver attributions for KPI drops.
- **Predictive Typing Indicator:** The UI smoothly utilizes animated dots / indicators and collapsible UI interactions alongside an intuitive right-sidebar layout. 

### 1.3 Data Sources & Ingestion System
- **Comprehensive Upload Flow:** A fully implemented `EcosystemAddSourceModal` with sharp edges, dropdown layouts, and easy integration selectors. Extensible for Excel, CSV, Data Warehouse tools (Snowflake, BigQuery), and Marketplace exports.
- **Data Parsing Utilities:** The backend comes equipped with structured parsing scripts: `parseExcel.ts`, `parseRetailCsv.ts`, `parseFulfilmentCsv.ts`, `parseTrafficCsv.ts`, and `parseWeatherCsv.ts`. 
- **Raw Ingestion Layer:** The `ingestRaw.ts` pipeline standardizes varying data formats to fit schemas like `OrderRecord`, `InventoryRecord`, and `TrafficRecord`. 

### 1.4 Agentic Root Cause Analysis (RCA Core)
The absolute core component of the product. Once anomalies are detected, a 4-layer AI agent logic kicks in:
- **Hypothesis Generation & Library (`hypothesisLibrary.ts`):** Fetches combinations of possible business reasons (e.g. stock out + high demand).
- **Hypothesis Testing (`hypothesisTester.ts`):** Evaluates real metrics against the hypothesis requirements to attach a confidence score.
- **Root Cause Ranking (`rootCauseRanker.ts`):** Prioritizes the most probable issues by financial hazard or impact.
- **Action Generation (`actionGenerator.ts` + `narrator.ts`):** Constructs human-readable narrative strings and automatically translates findings into defined "Actions" mapped to relevant roles (e.g., Supply Chain Manager, Ops).
- **Diagnosis React UI Flow:** A visual stepping component (`AnalysisProgress.tsx`, `AnalysisStep.tsx`) that shows the engine working in real-time, outputting final results into dedicated `RootCauseCard` and `RecommendedActionsCard`.

### 1.5 Real-Time Monitors, Signals & Thresholds
- **Threshold Configuration:** A comprehensive settings page interface (`SettingsPage.tsx`) allowing enterprise users to tweak KPI thresholds (e.g., DoD or WoW revenue drop sensitivity).
- **CRON / Background Monitors (`monitors/`):** 
  - `revenueAtRisk.ts`: Detailed metric decomposition script triggering alerts.
  - `demandSpikes.ts` & `inventoryExposure.ts`: Evaluates whether current inventory supports emerging trends.
  - `operationalBreakdowns.ts`: Targets fulfilment and logistical delays.
- **SSE Real-Time Push (`sseStore.ts`):** Web hook functionality connected to backend Server-Sent Events to push signal alerts into the user’s UI without polling delays. 

---

## 2. Frontend Subsystem Breakdown

### 2.1 UI Components (`src/components/`)
* **Chat Folder:** Contains `ChatInput.tsx` (query taking), `ChatInterface.tsx` (the core container), `ChatMessage.tsx` (the rendering of chat context), `RevenueAtRiskWidget.tsx` & `SignalsWidget.tsx` (financial alerts directly embedded into chat replies), and `TypingIndicator.tsx`.
* **Dashboard Folder:** `AlertItem.tsx` (notification wrapper), `DiagnosisSearchBar.tsx`, `LiveSignalsFeed.tsx` (stream container), `RevenueAtRiskChart.tsx` (complex analytics chart leveraging libraries like Tremor).
* **Diagnosis Folder:** Custom components that visualize the underlying agentic flow (`ActionItem.tsx`, `AnalysisProgress.tsx`, `AnalysisStep.tsx`, `BusinessImpactCard.tsx`, `GeographicOpportunityCard.tsx`, `QueryHeader.tsx`, `RecommendedActionsCard.tsx`, `RootCauseCard.tsx`).
* **Layout Folder:** Contains `AppShell.tsx` (main wrapper layout), `PageHeader.tsx`, `Sidebar.tsx`, `SidebarNav.tsx`, `UserProfileCard.tsx` (pinned dynamically at bottom), and `SessionHistory.tsx` (recent chat history list).
* **Sources Folder:** `AddSourceCard.tsx`, `EcosystemAddSourceModal.tsx` (sharp aesthetic selection UI for data sources), `SourceCard.tsx` (active connection display).
* **UI Utilities:** Global design pieces like `BackgroundAurora.tsx`, `GridCard.tsx`, `StatBox.tsx`, `Tag.tsx` which enforce the site visual system.

### 2.2 Global State Managers (`src/stores/`)
* `authStore.ts` & `tenantStorage.ts`: Handles the auth context, tokens, and multi-tenant partitioning on the client.
* `chatStore.ts` & `sessionStore.ts`: Controls the state of local message threads, input state, intelligent replies, and multi-session persistence.
* `dashboardStore.ts`: Coordinates active KPIs shown on the landing dashboard.
* `diagnosisStore.ts`: Orchestrates the step-by-step UI logic tracking Agentic RCA outputs.
* `settingsStore.ts`: Handles global configurations, role structures, and threshold editing states.
* `sidebarStore.ts`: Manages sidebar expansion/collapse transitions and layout resizing logic.
* `sourcesStore.ts`: Handles data source loading status, ingested tracking, and file validity.
* `sseStore.ts`: Tracks connection health and hooks into Server-Sent Events.

### 2.3 Application Pages (`src/pages/`)
- `ChatPage.tsx`
- `DashboardPage.tsx`
- `DiagnosisPage.tsx`
- `LandingPage.tsx`
- `LoginPage.tsx` / `SignupPage.tsx`
- `SettingsPage.tsx`
- `SignalInsightPage.tsx`
- `SourcesPage.tsx`

---

## 3. Backend Subsystem Breakdown

### 3.1 Database Modeling (`src/models/`, Mongoose)
* **Core Business Schema:** `OrderRecord.ts`, `InventoryRecord.ts`, `TrafficRecord.ts`, `FulfilmentRecord.ts`, `RetailRecord.ts`, `WeatherRecord.ts`.
* **Intelligence Concepts:** `Anomaly.ts`, `Hypothesis.ts`, `RootCause.ts`, `Action.ts`, `AnalysisSession.ts`.
* **System State Concepts:** `DataSource.ts`, `Tenant.ts`, `User.ts`, `OrgSettings.ts`, `RawIngestionRecord.ts`.

### 3.2 Services & Operations (`src/services/`)
* **Parsing Utilities:** `parseExcel.ts`, `parseFulfilmentCsv.ts`, `parseRetailCsv.ts`, `parseTrafficCsv.ts`, `parseWeatherCsv.ts`; connected to the general `ingestRaw.ts`.
* **Agentic Analysis Core (`services/analysis/`):** 
  - `anomalyDetector.ts` (threshold processing)
  - `hypothesisLibrary.ts`, `hypothesisTester.ts` (Generates scenarios based on anomaly, scores them against facts)
  - `rootCauseRanker.ts` (Weights factors using matrices of confidence/relevancy)
  - `actionGenerator.ts` (Converts RCA findings into actionable tasks)
  - `narrator.ts` (NLP bridging representation)
  - `runAnalysis.ts` (The orchestrator script tying it all together).
* **Signal Monitors (`services/monitors/`):** 
  - Scripts performing targeted logical detection runs for metrics like `demandSpikes.ts`, `inventoryExposure.ts`, `operationalBreakdowns.ts`, and `revenueAtRisk.ts`.
  - `computeAll.ts` aggregates runs of the individual monitors.
  - `signalEnricher.ts` provides additional metadata.

### 3.3 HTTP Endpoints (`src/routes/`)
- `/analysis`: Exposes the Agentic RCA flows to the frontend trigger.
- `/auth`: Login/Signup processing tokens.
- `/chat`: Retrieval, Creation, Update, and Delete endpoints for persistent Intelligence Hub sessions.
- `/dashboard`: API for retrieving high-level metrics and alerts.
- `/dataSources`: File uploads (multipart handlers) and metadata retrieval.
- `/notifications`: Controls alerts configuration.
- `/settings`: Org configuration mapping thresholds and user roles.
- `/signals`: Live push endpoint controller.
- `/health` / `/debugDb`: Observability routes for CI/CD checks and dev processes.
