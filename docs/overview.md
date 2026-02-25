# Project Overview: Agentic Decision Intelligence Platform

## 🎯 Vision
The Agentic Decision Intelligence Platform is an "Always-On" AI Copilot designed specifically for **Indian D2C and MSME retail businesses** (₹10-100 Cr ARR). It aims to transition business monitoring from passive dashboards to proactive, agentic action.

The primary objective is to reduce **Decision Latency** by:
1. **Detecting** anomalies in real-time.
2. **Diagnosing** root causes using autonomous agentic reasoning.
3. **Recommending/Orchestrating** actionable tasks with clear ownership.

## 🚀 The Core Idea: "Responsibility over Analysis"
Most BI tools show *what* happened. This platform explains *why* it happened and *who* needs to do *what* to fix it. 

**MVP Focus:** Stockout events leading to revenue drops.

---

## 🛠 Tech Stack
| Component | Technology |
| :--- | :--- |
| **Frontend** | React (Vite), TypeScript, shadcn/ui, Tremor Charts, Zustand |
| **Backend** | Node.js (Express), TypeScript, Server-Sent Events (SSE) |
| **AI/Agents** | AWS Bedrock (Claude 3.5 Sonnet), AWS Strands-Agents SDK |
| **Database** | MongoDB (App Data), Google BigQuery (Large-scale Data/Analytics) |
| **Infrastructure** | AWS (App Runner, Lambda, Cognito, CloudFront) |
| **Communication** | WhatsApp & Voice Integration (Phased rollout) |

---

## 🏗 System Architecture (6-Layer Model)
The platform is built on a modular 6-layer architecture to ensure clear separation of concerns:

1. **Layer 1: Data Intake** - Normalizing Excel, CSV, and Marketplace exports (Amazon/Flipkart).
2. **Layer 2: Normalization & Quality** - Schema mapping and data validation.
3. **Layer 3: Anomaly Detection** - Monitoring KPIs like Revenue (WoW/DoD) and SKU stockouts.
4. **Layer 4: Agentic RCA Core** - The "Brain" which generates and tests hypotheses for root causes.
5. **Layer 5: Action & Orchestration** - Mapping root causes to specific tasks and owners.
6. **Layer 6: User Interaction** - Dashboard, Chat Interface, and Real-time SSE updates.

---

## 📊 Business Metrics (KPIs)
The platform monitors critical retail KPIs at a granular level (SKU, Region, Channel):
- **Primary:** Revenue, Sales Velocity, Stockout Rate.
- **Secondary:** Conversion Rate (CVR), Average Order Value (AOV), Fulfilment Delays.

---

## 🗺 Roadmap (MVP & Beyond)
- **Phase 1 (MVP):** Stockout-Revenue Anomaly detection + Agentic RCA.
- **Phase 2:** Multi-source integration (Shopify, ERP, WMS).
- **Phase 3:** Predictive restocking and demand forecasting.
- **Phase 4:** Voice/WhatsApp-first interaction for mobile-first Bharat founders.
