# System & Frontend Architecture

## 🏛 Backend Architecture
The backend is designed as a modular **Node.js/Express** microservice ecosystem that leverages event-driven patterns for high responsiveness.

### Core Backend Modules:
- **Ingestion Engine:** Robust parsers for `.xlsx` and `.csv` using `xlsx` and `csv-parse`.
- **Reasoning Service:** Interface with **AWS Bedrock**. Uses Structured Output to ensure the LLM returns data that fits our internal `Hypothesis` and `RootCause` models.
- **SSE Streamer:** A dedicated pub/sub mechanism to push live updates to the frontend without polling.
- **Workflow Orchestrator:** Manages the lifecycle of an anomaly from detection -> analysis -> action.

---

## 🎨 Frontend Architecture & UX
The frontend is built for **Speed, Premium Aesthetics, and Clarity**.

### Tech Stack Details:
- **Vite & React:** High-performance bundling and developer experience.
- **shadcn/ui:** Tailored components using Tailwind CSS for a consistent "Enterprise-Grade" look.
- **Zustand:** Centralized state to manage real-time updates from SSE.
- **Tremor:** Highly specialized UI library for building dashboards that feel like Bloomberg or Stripe.

### Design Principles:
1. **Glassmorphism & Depth:** Using subtle shadows and frosted glass effects to create a modern feel.
2. **Action-Oriented Views:** Instead of just charts, we use "Action Cards" which are the primary unit of the dashboard.
3. **Micro-Animations:** Using Framer Motion for smooth transitions between "Detected" and "Analyzing" states of an anomaly.

---

## 💾 Data Models (Key Schemas)
### Anomaly
```typescript
{
  id: string,
  kpiName: "Revenue" | "Inventory",
  severity: "critical" | "high" | "medium",
  status: "detected" | "analyzing" | "resolved",
  deviationPercent: number,
  detectedAt: Date
}
```

### Action
```typescript
{
  id: string,
  type: "replenish_stock" | "fix_listing" | "escalate_ops",
  priority: "urgent" | "high" | "normal",
  owner: string,
  linkedRootCause: string
}
```

---

## 🔐 Security & Operations
- **Auth:** AWS Cognito (JWT-based session management).
- **Hosting:** AWS App Runner for compute; MongoDB Atlas for persistence.
- **Monitoring:** CloudWatch logs for tracking Agentic reasoning chains and API performance.
