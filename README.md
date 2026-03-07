# Nexus Intelligence

**Agentic Decision Intelligence Platform** — An **"Always-On" AI Copilot** for **Indian D2C and MSME retail** (₹10–100 Cr ARR). It moves monitoring from passive dashboards to **proactive, agentic action** with clear ownership — detecting anomalies early, diagnosing root causes with evidence, and recommending **who** should do **what** to fix it.

---

## Use case

### Who it’s for

**Persona:** Ops / Growth lead at an Indian D2C brand (Shopify, marketplaces, WMS/ERP, logistics). Daily firefighting: stockouts, demand spikes, delivery issues, returns.

**Need:** “What to do next” faster than analytics dashboards — **detect early**, **diagnose with evidence**, **recommend actions** with impact and owner.

### What problem it solves

Most BI tools show *what* happened. This platform answers *why* it happened and **who** needs to do **what** to fix it. Output is **owned actions**, not just charts.

**MVP focus:** **Stockout events leading to revenue drops** — full flow from detect → diagnose → recommend.

---

## Proactive nature

The platform is **proactive**, not reactive:

- **Continuous monitoring** — Revenue (WoW/DoD), SKU stockouts, conversion, and operations are monitored in near real time.
- **Early alerts** — Anomalies are surfaced with severity and status **before** they become critical, so teams can act in time.
- **Always-on** — No need to open dashboards; the system detects issues and can push alerts and recommended actions to the right people.
- **Action-first** — Every alert is tied to hypotheses, root causes, and suggested next steps with priority and ownership.

---

## End-to-end flow (decision latency reduction)

| Step | Description |
|------|-------------|
| **Detect** | Anomalies in revenue (WoW/DoD), SKU stockouts, conversion, operations; severity and status. |
| **Diagnose** | Agentic root cause analysis: hypotheses → test against data → rank root causes → confidence scores and **evidence chain** (auditability). |
| **Recommend** | Actionable tasks with **priority**, **suggested/assigned owner**, and link to root cause; optional push to teams (e.g. email, task ID). |

---

## Platform architecture (6 layers)

| Layer | Purpose |
|-------|---------|
| **1. Data intake** | Excel, CSV, marketplace exports; optional enterprise data warehouse. |
| **2. Normalization & quality** | Schema mapping, validation, unified data model. |
| **3. Anomaly detection** | Revenue, stockout, conversion, operations anomalies. |
| **4. Agentic RCA core** | Hypotheses → test → rank root causes (RCAagent: LangGraph + Bedrock + AgentCore). |
| **5. Action & orchestration** | Action types, priority, ownership, optional push to teams. |
| **6. User interaction** | Dashboard, chat, real-time SSE. |

---

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React (Vite), TypeScript, shadcn/ui, Tremor, Zustand |
| Backend | Node.js (Express), TypeScript, SSE |
| AI / Agentic | AWS Bedrock (Claude), LangChain + LangGraph, Bedrock AgentCore |
| Data | MongoDB, (optional) Google Bigquery |
| Infra | AWS (App Runner, Cognito, CloudFront) |

---

## Project structure

```
first-commit/
├── README.md           ← You are here
├── backend/            ← Express API, SSE, data & anomaly APIs
├── frontend/           ← React dashboard, chat, real-time updates
├── RCAagent/           ← Agentic RCA (LangGraph + Bedrock + AgentCore)
├── design.md           ← Full design (layers, interfaces)
├── requirements.md     ← User stories & acceptance criteria
└── docs/
    ├── overview.md
    ├── architecture_technical.md
    └── agentic_reasoning.md
```

---

## Quick start

1. Copy `.env.example` to `.env` and set `MONGODB_URI`, AWS credentials, etc.
2. **Backend:** `cd backend && npm install && npm run dev`
3. **Frontend:** `cd frontend && npm install && npm run dev`
4. Open the app and hit `/health` to confirm the backend is up.

---

## Future scope

Planned extensions beyond the current MVP:

| Area | Description |
|------|-------------|
| **WhatsApp integration** | Push proactive alerts, root-cause summaries, and recommended actions to Ops/Growth via WhatsApp; optional two-way interaction for quick responses and task updates. |
| **Third-party API integration (data sources)** | Ingest from marketplaces (Amazon, Flipkart, etc.), WMS/ERP, logistics, and ads platforms via APIs for unified monitoring and RCA without manual file uploads. |
| **Multilanguage** | UI, alerts, and recommendations in Hindi, regional languages, and English so teams can work in their preferred language. |
| **Self-healing mechanism** | Automatic retries, data-quality checks, and pipeline recovery; detection of stale or failed jobs and corrective actions with minimal manual intervention. |
| **Voice capabilities** | Voice input for queries and commands, and voice output for alerts and summaries, for hands-free use in warehouses and on the go. |

These are on the phased roadmap and not part of the current MVP.

---

## Docs

- [Overview & vision](docs/overview.md)
- [Design (6 layers, interfaces)](design.md)
- [Requirements](requirements.md)
- [Agentic reasoning](docs/agentic_reasoning.md)

---

## License

Proprietary / TBD.
