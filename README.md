# Agentic Decision Intelligence Platform

An **"Always-On" AI Copilot** for Indian D2C and MSME retail (₹10–100 Cr ARR). Detects anomalies, diagnoses root causes with AI, and recommends actions with clear ownership.

---

## What it does

| Step | Description |
|------|-------------|
| **Detect** | Anomalies in revenue (WoW/DoD) and SKU stockouts |
| **Diagnose** | Agentic root cause analysis (hypotheses → test → rank) |
| **Recommend** | Actionable tasks with priority and suggested owner |

**MVP focus:** Stockout events leading to revenue drops.

---

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React (Vite), TypeScript, shadcn/ui, Tremor, Zustand |
| Backend | Node.js (Express), TypeScript, SSE |
| AI | AWS Bedrock (Claude 3.5 Sonnet), Strands-Agents SDK |
| Data | MongoDB, (optional) Google BigQuery |
| Infra | AWS (App Runner, Cognito, CloudFront) |

---

## 7-day prototype plan

| Day | Focus | Outcome |
|-----|--------|---------|
| **Day 1** | Project setup & backend skeleton | Repo structure, DB, models, health check, frontend shell |
| **Day 2** | Data intake | Upload Excel/CSV (and optional enterprise DW connection) → parse/sync → store; data source status |
| **Day 3** | Normalization + anomaly detection | Unified schema; revenue & stockout anomalies; anomaly API |
| **Day 4** | Agentic RCA core | Hypotheses (Bedrock) → test → root causes; audit trail |
| **Day 5** | Actions + SSE | Actions from root causes; action API; real-time SSE |
| **Day 6** | Frontend dashboard | Anomalies, issues, actions, KPI chart; live updates |
| **Day 7** | Chat + polish | Chat for KPI/anomaly/SKU; E2E flow; README & docs |

**Full task list:** [TASKS.md](./TASKS.md) — detailed checklist for each day (use it to track progress).

---

## Project structure

```
first-commit/
├── README.md           ← You are here
├── TASKS.md            ← 7-day task list (track progress here)
├── design.md           ← Full design doc (layers, interfaces, properties)
├── requirements.md     ← User stories & acceptance criteria
└── docs/
    ├── overview.md     ← Vision, stack, 6-layer architecture
    ├── architecture_technical.md
    └── agentic_reasoning.md
```

*(Backend and frontend app code will live in `backend/` and `frontend/` or similar once created.)*

---

## Quick start (after Day 1)

1. Copy `.env.example` to `.env` and set `MONGODB_URI`, AWS credentials, etc.
2. **Backend:** `cd backend && npm install && npm run dev`
3. **Frontend:** `cd frontend && npm install && npm run dev`
4. Open dashboard and hit `/health` to confirm backend is up.

---

## Docs

- [Overview & vision](docs/overview.md)
- [Design (6 layers, interfaces, correctness)](design.md)
- [Requirements](requirements.md)
- [Agentic reasoning](docs/agentic_reasoning.md)
- [7-day task list](TASKS.md)

---

## License

Proprietary / TBD.
