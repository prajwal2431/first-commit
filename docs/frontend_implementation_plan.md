# Frontend Implementation Plan — Nexus Intelligence Platform

## Decisions Summary

| Decision | Choice |
|---|---|
| Framework | React + Vite + TypeScript |
| CSS | Tailwind CSS **v4** |
| Component Library | shadcn/ui |
| Charts | Tremor (dashboard metrics) + Recharts (custom/complex) |
| Animations | Framer Motion |
| State Management | Zustand (global stores) |
| Routing | React Router v6 (URL-based routes) |
| API Layer | Dedicated service layer (`src/services/api/`) |
| SSE | Scaffolded client hook + service (template-level) |
| Auth | Out of scope for this phase |

---

## 1. Folder Structure

```
frontend/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── postcss.config.js
├── components.json              # shadcn/ui config
│
├── public/
│   └── favicon.svg
│
└── src/
    ├── main.tsx                  # ReactDOM.createRoot, BrowserRouter
    ├── App.tsx                   # Route definitions
    ├── index.css                 # Tailwind v4 directives, design tokens, fonts, global styles
    │
    ├── types/                    # Shared TypeScript interfaces (mapped to design.md models)
    │   ├── anomaly.ts
    │   ├── diagnosis.ts
    │   ├── action.ts
    │   ├── source.ts
    │   ├── session.ts
    │   ├── chat.ts
    │   ├── dashboard.ts
    │   └── index.ts              # Re-exports all types
    │
    ├── services/                 # API + SSE communication layer
    │   ├── api/
    │   │   ├── client.ts         # Base fetch/axios wrapper (base URL, headers, error handling)
    │   │   ├── dashboard.ts      # GET /api/dashboard/*
    │   │   ├── diagnosis.ts      # POST/GET /api/diagnosis/*
    │   │   ├── anomalies.ts      # GET /api/anomalies/*
    │   │   ├── actions.ts        # GET/POST/PATCH /api/actions/*
    │   │   ├── sources.ts        # GET/POST/DELETE /api/sources/*
    │   │   ├── sessions.ts       # GET/PATCH/DELETE /api/sessions/*
    │   │   └── chat.ts           # GET/POST /api/diagnosis/:id/chat
    │   │
    │   └── sse/
    │       └── sseClient.ts      # SSE connection manager (connect, reconnect, event dispatch)
    │
    ├── stores/                   # Zustand global state
    │   ├── sidebarStore.ts       # Sidebar open/collapsed state
    │   ├── sessionStore.ts       # Session list, active session, CRUD
    │   ├── diagnosisStore.ts     # Current diagnosis state (query, progress, result data)
    │   ├── chatStore.ts          # Chat messages for active diagnosis
    │   ├── dashboardStore.ts     # Anomalies, KPI data, chart data
    │   ├── sourcesStore.ts       # Connected data sources list
    │   └── sseStore.ts           # SSE connection status, incoming event buffer
    │
    ├── hooks/                    # Custom React hooks
    │   ├── useSSE.ts             # Hook wrapping SSE client, dispatches to Zustand stores
    │   └── useMediaQuery.ts      # Responsive breakpoint hook
    │
    ├── lib/                      # Utility functions
    │   └── utils.ts              # cn() classname merger, formatCurrency, etc.
    │
    ├── components/               # ALL reusable UI
    │   ├── layout/
    │   │   ├── AppShell.tsx       # Sidebar + <Outlet /> wrapper
    │   │   ├── Sidebar.tsx        # Collapsible sidebar with nav, history, user profile
    │   │   ├── SidebarNav.tsx     # Intelligence / Data Sources toggle buttons
    │   │   ├── SessionHistory.tsx # History list with rename/delete/load
    │   │   ├── UserProfileCard.tsx# Bottom user card
    │   │   └── PageHeader.tsx     # Top header (org tag, title, session info)
    │   │
    │   ├── ui/                   # Atomic design primitives (shadcn + custom)
    │   │   ├── Tag.tsx            # Status/label badge (neutral, alert, success, purple)
    │   │   ├── GridCard.tsx       # Glass-panel animated card container
    │   │   ├── StatBox.tsx        # Single KPI stat box with trend indicator
    │   │   ├── BackgroundAurora.tsx# Ambient gradient + grid background
    │   │   └── ...               # shadcn/ui components (Button, Input, etc.)
    │   │
    │   ├── dashboard/
    │   │   ├── RevenueAtRiskChart.tsx   # AreaChart: revenue vs traffic gap
    │   │   ├── LiveSignalsFeed.tsx      # Anomaly alert list container
    │   │   ├── AlertItem.tsx            # Single alert row (critical/warning/info)
    │   │   └── DiagnosisSearchBar.tsx   # Main search + diagnose input with suggestions
    │   │
    │   ├── diagnosis/
    │   │   ├── AnalysisProgress.tsx     # Full "Synthesizing Intelligence" card
    │   │   ├── AnalysisStep.tsx         # Single step row (queued/processing/done)
    │   │   ├── QueryHeader.tsx          # Black banner showing the diagnosed query
    │   │   ├── RootCauseCard.tsx        # Root cause findings + Social vs Inventory chart
    │   │   ├── BusinessImpactCard.tsx   # 2×2 grid of StatBox components
    │   │   ├── RecommendedActionsCard.tsx # Actions list card
    │   │   ├── ActionItem.tsx           # Single action with execute animation
    │   │   └── GeographicOpportunityCard.tsx # Overstock→Stockout map card
    │   │
    │   ├── chat/
    │   │   ├── ChatInterface.tsx        # Full chat region (messages + input)
    │   │   ├── ChatMessage.tsx          # Single user/bot message bubble
    │   │   ├── TypingIndicator.tsx      # Animated "..." dots
    │   │   └── ChatInput.tsx            # Follow-up input form with send button
    │   │
    │   └── sources/
    │       ├── SourceCard.tsx           # Single connected source card
    │       └── AddSourceCard.tsx        # Dashed "Connect Integration" placeholder
    │
    └── pages/                    # Route-level page components
        ├── DashboardPage.tsx     # "/" — Revenue chart + signals + search bar
        ├── DiagnosisPage.tsx     # "/diagnosis/:id" — Analyzing → Result + Chat
        └── SourcesPage.tsx       # "/sources" — Connected grounding sources
```

---

## 2. Routes (React Router v6)

| Route | Page Component | Description |
|---|---|---|
| `/` | `DashboardPage` | Default landing — KPI charts, live signals, diagnosis search bar |
| `/diagnosis/:id` | `DiagnosisPage` | Handles both the "analyzing" progress state AND the final result + chat |
| `/sources` | `SourcesPage` | Connected data sources management |

All routes are wrapped inside `AppShell` which provides the `Sidebar` and `PageHeader` as shared layout via React Router's `<Outlet />`.

```tsx
// App.tsx — simplified
<BrowserRouter>
  <Routes>
    <Route element={<AppShell />}>
      <Route index element={<DashboardPage />} />
      <Route path="diagnosis/:id" element={<DiagnosisPage />} />
      <Route path="sources" element={<SourcesPage />} />
    </Route>
  </Routes>
</BrowserRouter>
```

---

## 3. Component Breakdown (from Artifact → Components)

### 3.1 Layout Components

#### `AppShell.tsx`
- **Source:** The outermost `<div className="min-h-screen relative flex">` in the artifact
- **Responsibility:** Wraps `Sidebar` + `<Outlet />`, applies `BackgroundAurora`
- **Consumes store:** `useSidebarStore` (for `sidebarWidth` to set `marginLeft`)
- **Children:** `<BackgroundAurora />`, `<Sidebar />`, `<main><PageHeader /><Outlet /></main>`

#### `Sidebar.tsx`
- **Source:** The `<motion.aside>` block in the artifact
- **Responsibility:** Renders the togglable sidebar container. Delegates internals to sub-components.
- **Consumes store:** `useSidebarStore` (isOpen, toggle)
- **Children:** `<SidebarNav />`, `<SessionHistory />`, `<UserProfileCard />`

#### `SidebarNav.tsx`
- **Source:** The "Intelligence" / "Data Sources" toggle buttons
- **Responsibility:** Navigation links using React Router's `<NavLink>`
- **Consumes store:** `useSidebarStore` (isOpen — for label visibility)

#### `SessionHistory.tsx`
- **Source:** The `[ HISTORY ]` section with session list, 3-dot menu, rename, delete
- **Responsibility:** Renders session list, handles rename/delete via store actions
- **Consumes store:** `useSessionStore` (sessions, activeSessionId, renameSession, deleteSession)

#### `UserProfileCard.tsx`
- **Source:** The bottom "BC / Admin Ops / PRO PLAN" card
- **Responsibility:** Displays user info (static for now, will connect to auth later)
- **Consumes store:** None (static, or future auth store)

#### `PageHeader.tsx`
- **Source:** The `<header>` block with "BONKERS_CORNER_HQ" and session info
- **Responsibility:** Renders page title (switches based on current route), org metadata
- **Props:** None needed — derives title from `useLocation()` or route context

### 3.2 UI Primitives

#### `Tag.tsx`
- **Source:** The `Tag` component in artifact
- **Props:** `{ children: ReactNode, type: 'neutral' | 'alert' | 'success' | 'purple' }`
- **Notes:** Pure presentational, no store dependency

#### `GridCard.tsx`
- **Source:** The `GridCard` component in artifact
- **Props:** `{ children, className?, title?, meta?, colSpan?, delay?, onClick? }`
- **Notes:** The main wrapper card with glass-panel, corner accents, hover aurora effect

#### `StatBox.tsx`
- **Source:** The `StatBox` component in artifact
- **Props:** `{ label, value, sub?, trend?, color }`
- **Notes:** Pure presentational stat display

#### `BackgroundAurora.tsx`
- **Source:** The fixed background div with aurora gradients + grid lines
- **Notes:** Extracted from `AppShell` for cleanliness

### 3.3 Dashboard Components

#### `RevenueAtRiskChart.tsx`
- **Source:** The "Revenue at Risk" `GridCard` with `AreaChart`
- **Consumes store:** `useDashboardStore` → `revenueChartData`, `revenueGapPercent`
- **API trigger:** `dashboardApi.getRevenueChart()` called in store action
- **Charts used:** **Recharts** `AreaChart` — complex dual-area overlay

#### `LiveSignalsFeed.tsx`
- **Source:** The "Live Signals" `GridCard` with list of `AlertItem`
- **Consumes store:** `useDashboardStore` → `anomalies` (filtered to recent/active)
- **API trigger:** `anomaliesApi.list()` (or fed via SSE)
- **Children:** Maps over anomalies → `<AlertItem />`

#### `AlertItem.tsx`
- **Source:** The `AlertItem` sub-component in artifact
- **Props:** `{ level: 'critical'|'warning'|'info', message, time, onClick }`
- **Behavior:** On click → navigates to `/diagnosis/:id` (triggers new diagnosis via store)

#### `DiagnosisSearchBar.tsx`
- **Source:** The large search input with gradient border + suggestion chips
- **Props:** None (self-contained)
- **Consumes store:** `useDiagnosisStore` → `startDiagnosis(query)` action
- **Behavior:** On Enter/click → calls store action → navigates to `/diagnosis/:newId`

### 3.4 Diagnosis Components

#### `AnalysisProgress.tsx`
- **Source:** The "Synthesizing Intelligence" card with progress steps
- **Consumes store:** `useDiagnosisStore` → `analysisProgress`, `diagnosisStatus`
- **API trigger:** SSE events update progress, OR polling `diagnosisApi.getProgress(id)`
- **Children:** List of `<AnalysisStep />` components
- **Transition:** When all 4 steps complete → store sets `status: 'completed'` → `DiagnosisPage` switches to result view

#### `AnalysisStep.tsx`
- **Source:** The `AnalysisStep` component in artifact
- **Props:** `{ step: string, label: string, status: 'waiting'|'processing'|'done' }`
- **Notes:** Pure presentational with progress bar animation

#### `QueryHeader.tsx`
- **Source:** The black `<div>` showing "QUERY ANALYSIS" and the diagnosed query
- **Props:** `{ query: string }`
- **Notes:** Pure presentational

#### `RootCauseCard.tsx`
- **Source:** The "Root Cause Identified" GridCard
- **Consumes store:** `useDiagnosisStore` → `rootCause`, `externalFactorsData`
- **Charts used:** **Recharts** `LineChart` — Social Hype vs Inventory (step + monotone lines)
- **Sub-elements:** Contributing factors list (Instagram trigger, Inventory blindspot, etc.)

#### `BusinessImpactCard.tsx`
- **Source:** The "Business Impact" GridCard with 2×2 StatBox grid
- **Consumes store:** `useDiagnosisStore` → `impactMetrics`
- **Children:** 4× `<StatBox />`

#### `RecommendedActionsCard.tsx`
- **Source:** The "Recommended Actions" GridCard with action list
- **Consumes store:** `useDiagnosisStore` → `actions[]`
- **Children:** Maps actions → `<ActionItem />`

#### `ActionItem.tsx`
- **Source:** The `ActionItem` sub-component in artifact
- **Props:** `{ icon, title, desc, priority, actionId }`
- **Local state:** `status: 'idle'|'processing'|'done'` (for execute animation)
- **API trigger:** On click → `actionsApi.execute(actionId)`

#### `GeographicOpportunityCard.tsx`
- **Source:** The "Geographic Opportunity" GridCard with Globe + Overstock→Stockout
- **Consumes store:** `useDiagnosisStore` → `geographicData` (origin, destination, stock levels)
- **Notes:** Will eventually use a real map component; for MVP uses the stylized card from artifact

### 3.5 Chat Components

#### `ChatInterface.tsx`
- **Source:** The chat section at the bottom of the result view
- **Responsibility:** Container for message list + input. Handles auto-scroll.
- **Consumes store:** `useChatStore` → `messages[]`, `isTyping`, `sendMessage()`
- **Children:** `<ChatMessage />` × N, `<TypingIndicator />`, `<ChatInput />`

#### `ChatMessage.tsx`
- **Source:** The user/bot message bubbles inside `chatHistory.map()`
- **Props:** `{ role: 'user'|'bot', text: string, citations?: Citation[] }`
- **Notes:** Bot messages show "N" avatar; user messages right-aligned

#### `TypingIndicator.tsx`
- **Source:** The 3 animated bouncing dots
- **Renders when:** `useChatStore` → `isTyping === true`

#### `ChatInput.tsx`
- **Source:** The sticky follow-up input form with gradient border
- **Props:** `{ onSubmit: (text: string) => void, disabled?: boolean }`
- **Notes:** Calls `useChatStore.sendMessage()` on submit

### 3.6 Sources Components

#### `SourceCard.tsx`
- **Source:** The connected source cards (Shopify, Unicommerce, etc.)
- **Props:** `{ source: DataSource }` (icon, name, type, status, lastSync)
- **Consumes store:** None (props-driven from `SourcesPage`)

#### `AddSourceCard.tsx`
- **Source:** The dashed "Connect Integration" placeholder card
- **Props:** `{ onClick: () => void }`

---

## 4. API Endpoints (Service Layer → Backend)

Every function returns a typed `Promise<T>`. Mock/real switching happens inside `client.ts`.

### 4.1 `services/api/client.ts` — Base Client

```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', /* auth headers later */ },
    ...options,
  });
  if (!res.ok) throw new ApiError(res.status, await res.json());
  return res.json();
}
```

### 4.2 `services/api/dashboard.ts`

| Function | Method | Endpoint | Returns | Maps to Layer |
|---|---|---|---|---|
| `getSummary()` | GET | `/dashboard/summary` | `DashboardSummary` | Layer 3 + 6 |
| `getRevenueChart(range?)` | GET | `/dashboard/revenue-chart` | `RevenueDataPoint[]` | Layer 3 |
| `getKPITrends(kpiName, range?)` | GET | `/dashboard/kpi-trends` | `KPIValue[]` | Layer 3 |

### 4.3 `services/api/anomalies.ts`

| Function | Method | Endpoint | Returns | Maps to Layer |
|---|---|---|---|---|
| `list(filters?)` | GET | `/anomalies` | `Anomaly[]` | Layer 3 |
| `getById(id)` | GET | `/anomalies/:id` | `Anomaly` | Layer 3 |
| `dismiss(id)` | PATCH | `/anomalies/:id/dismiss` | `Anomaly` | Layer 3 |

### 4.4 `services/api/diagnosis.ts`

| Function | Method | Endpoint | Returns | Maps to Layer |
|---|---|---|---|---|
| `start(query)` | POST | `/diagnosis` | `{ diagnosisId: string }` | Layer 4 (triggers RCA) |
| `getResult(id)` | GET | `/diagnosis/:id` | `DiagnosisResult` | Layer 4 + 5 |
| `getProgress(id)` | GET | `/diagnosis/:id/progress` | `DiagnosisProgress` | Layer 4 |

### 4.5 `services/api/actions.ts`

| Function | Method | Endpoint | Returns | Maps to Layer |
|---|---|---|---|---|
| `list(diagnosisId?)` | GET | `/actions` | `Action[]` | Layer 5 |
| `execute(id)` | POST | `/actions/:id/execute` | `Action` | Layer 5 |
| `updateStatus(id, status)` | PATCH | `/actions/:id` | `Action` | Layer 5 |

### 4.6 `services/api/sources.ts`

| Function | Method | Endpoint | Returns | Maps to Layer |
|---|---|---|---|---|
| `list()` | GET | `/sources` | `DataSource[]` | Layer 1 |
| `getById(id)` | GET | `/sources/:id` | `DataSource` | Layer 1 |
| `connect(payload)` | POST | `/sources` | `DataSource` | Layer 1 |
| `disconnect(id)` | DELETE | `/sources/:id` | `void` | Layer 1 |
| `sync(id)` | POST | `/sources/:id/sync` | `DataSource` | Layer 1 |

### 4.7 `services/api/sessions.ts`

| Function | Method | Endpoint | Returns | Maps to Layer |
|---|---|---|---|---|
| `list()` | GET | `/sessions` | `Session[]` | Layer 6 |
| `rename(id, name)` | PATCH | `/sessions/:id` | `Session` | Layer 6 |
| `delete(id)` | DELETE | `/sessions/:id` | `void` | Layer 6 |

### 4.8 `services/api/chat.ts`

| Function | Method | Endpoint | Returns | Maps to Layer |
|---|---|---|---|---|
| `getHistory(diagnosisId)` | GET | `/diagnosis/:id/chat` | `ChatMessage[]` | Layer 6 + 4 |
| `sendMessage(diagnosisId, text)` | POST | `/diagnosis/:id/chat` | `ChatMessage` | Layer 4 + 6 |

### 4.9 `services/sse/sseClient.ts`

```typescript
// Template-level SSE client
type SSEEventType = 'anomaly_detected' | 'rca_progress' | 'rca_completed' | 'action_created';

class NexusSSEClient {
  private eventSource: EventSource | null = null;
  private listeners: Map<SSEEventType, Set<(data: any) => void>> = new Map();

  connect(baseUrl: string): void { /* ... */ }
  disconnect(): void { /* ... */ }
  on(event: SSEEventType, handler: (data: any) => void): () => void { /* returns unsubscribe */ }
  // Auto-reconnect with exponential backoff
  // Heartbeat detection (30s timeout)
}

// Endpoint: GET /api/events/stream (SSE)
```

---

## 5. Zustand Stores

### 5.1 `stores/sidebarStore.ts`

```typescript
interface SidebarState {
  isOpen: boolean;
  width: number;              // computed: isOpen ? 280 : 72
  toggle: () => void;
  close: () => void;          // for mobile dismiss
}
```

### 5.2 `stores/sessionStore.ts`

```typescript
interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  isLoading: boolean;

  // Actions — all call services/api/sessions internally
  fetchSessions: () => Promise<void>;
  setActiveSession: (id: string) => void;
  createSession: (query: string) => Promise<Session>;
  renameSession: (id: string, name: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  clearActiveSession: () => void;
}
```

### 5.3 `stores/diagnosisStore.ts`

```typescript
interface DiagnosisState {
  // Current diagnosis context
  currentQuery: string;
  diagnosisId: string | null;
  status: 'idle' | 'analyzing' | 'completed' | 'error';
  analysisProgress: number;            // 0-4 (matches analysis steps)

  // Result data (populated when status === 'completed')
  rootCause: RootCause | null;
  impactMetrics: ImpactMetrics | null;
  actions: Action[];
  externalFactorsData: ExternalFactor[];
  geographicData: GeographicInsight | null;

  // Actions
  startDiagnosis: (query: string) => Promise<string>;  // returns diagnosisId
  fetchResult: (id: string) => Promise<void>;
  updateProgress: (step: number) => void;               // called by SSE handler
  reset: () => void;
}
```

### 5.4 `stores/chatStore.ts`

```typescript
interface ChatState {
  messages: ChatMessage[];
  isTyping: boolean;
  isLoading: boolean;

  // Actions
  loadHistory: (diagnosisId: string) => Promise<void>;
  sendMessage: (diagnosisId: string, text: string) => Promise<void>;
  addBotMessage: (message: ChatMessage) => void;  // called by SSE or API response
  clearMessages: () => void;
}
```

### 5.5 `stores/dashboardStore.ts`

```typescript
interface DashboardState {
  anomalies: Anomaly[];
  revenueChartData: RevenueDataPoint[];
  summary: DashboardSummary | null;
  isLoading: boolean;
  lastUpdated: Date | null;

  // Actions
  fetchDashboard: () => Promise<void>;
  fetchRevenueChart: (range?: string) => Promise<void>;
  addAnomaly: (anomaly: Anomaly) => void;       // called by SSE
  dismissAnomaly: (id: string) => Promise<void>;
}
```

### 5.6 `stores/sourcesStore.ts`

```typescript
interface SourcesState {
  sources: DataSource[];
  isLoading: boolean;

  // Actions
  fetchSources: () => Promise<void>;
  connectSource: (payload: ConnectSourceRequest) => Promise<void>;
  disconnectSource: (id: string) => Promise<void>;
  syncSource: (id: string) => Promise<void>;
}
```

### 5.7 `stores/sseStore.ts`

```typescript
interface SSEState {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastEventTime: Date | null;

  // Actions
  connect: () => void;
  disconnect: () => void;
  // Internally dispatches events TO other stores:
  //   anomaly_detected  → dashboardStore.addAnomaly()
  //   rca_progress      → diagnosisStore.updateProgress()
  //   rca_completed     → diagnosisStore.fetchResult()
  //   action_created    → diagnosisStore (refresh actions)
}
```

---

## 6. TypeScript Types (`src/types/`)

### `types/anomaly.ts`
```typescript
export interface Anomaly {
  id: string;
  kpiName: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'detected' | 'analyzing' | 'resolved' | 'dismissed';
  currentValue: number;
  expectedValue: number;
  deviationPercent: number;
  dimensions: Record<string, string>;   // e.g., { region: 'North', sku: 'DISNEY-01' }
  detectedAt: string;                   // ISO date
  message?: string;                     // human-readable summary
}
```

### `types/diagnosis.ts`
```typescript
export interface DiagnosisResult {
  id: string;
  query: string;
  status: 'analyzing' | 'completed' | 'error';
  rootCause: RootCause | null;
  impactMetrics: ImpactMetrics | null;
  actions: Action[];
  externalFactorsData: ExternalFactor[];
  geographicData: GeographicInsight | null;
  createdAt: string;
}

export interface DiagnosisProgress {
  diagnosisId: string;
  currentStep: number;     // 0-4
  steps: DiagnosisStep[];
  status: 'analyzing' | 'completed' | 'error';
}

export interface DiagnosisStep {
  step: number;
  label: string;
  status: 'waiting' | 'processing' | 'done';
}

export interface RootCause {
  id: string;
  title: string;                        // e.g., "Inventory Mismatch"
  description: string;                  // brief highlighted text
  confidenceScore: number;              // 0-1
  contributingFactors: ContributingFactor[];
  evidenceChain: Evidence[];
}

export interface ContributingFactor {
  icon: string;             // icon identifier for frontend mapping
  title: string;
  description: string;
}

export interface Evidence {
  dataSource: string;
  query: string;
  result: any;
  interpretation: string;
  timestamp: string;
}

export interface ImpactMetrics {
  lostRevenue: { value: string; trend: 'up' | 'down' };
  conversion: { value: string; trend: 'up' | 'down' };
  stockHQ: { value: string; sub: string };
  stockTarget: { value: string; sub: string };
}

export interface ExternalFactor {
  time: string;
  [key: string]: number | string;       // dynamic series (social_hype, inventory, etc.)
}

export interface GeographicInsight {
  origin: { label: string; status: string; };    // e.g., "MUMBAI (HQ)" / "Overstock"
  destination: { label: string; status: string; }; // e.g., "DELHI (NCR)" / "Stockout"
  narrative: string;
}
```

### `types/action.ts`
```typescript
export interface Action {
  id: string;
  rootCauseId: string;
  anomalyId: string;
  actionType: 'replenish_inventory' | 'escalate_ops_issue' | 'investigate_sku_listing';
  title: string;
  description: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  suggestedOwner: string;
  assignedOwner?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed';
  icon?: string;              // icon identifier for frontend mapping
  context: Record<string, any>;
  createdAt: string;
  dueDate?: string;
  completedAt?: string;
}
```

### `types/source.ts`
```typescript
export interface DataSource {
  id: string;
  name: string;
  type: string;               // e.g., "POS & Storefront", "Inventory & ERP"
  status: 'connected' | 'syncing' | 'error' | 'disconnected';
  lastSync: string;
  icon?: string;              // icon identifier for frontend mapping
}

export interface ConnectSourceRequest {
  name: string;
  type: string;
  credentials?: Record<string, string>;
}
```

### `types/session.ts`
```typescript
export interface Session {
  id: string;
  query: string;              // renamed display name
  diagnosisId?: string;       // links to the diagnosis result
  date: string;
  createdAt: string;
}
```

### `types/chat.ts`
```typescript
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: Citation[];
}

export interface Citation {
  dataSource: string;
  query: string;
  confidence: number;
}
```

### `types/dashboard.ts`
```typescript
export interface DashboardSummary {
  activeAnomalies: number;
  pendingActions: number;
  revenueGapPercent: number;
  lastUpdated: string;
}

export interface RevenueDataPoint {
  day: string;
  sales: number;
  traffic: number;
}

export interface KPIValue {
  kpiName: string;
  value: number;
  timestamp: string;
  dimensions: Record<string, string>;
}
```

---

## 7. Data Flow Diagrams

### 7.1 Diagnosis Flow (User searches → Result)

```
User types query in DiagnosisSearchBar
        │
        ▼
diagnosisStore.startDiagnosis(query)
        │
        ├── POST /api/diagnosis  →  returns { diagnosisId }
        ├── sessionStore.createSession(query)
        ├── navigate(`/diagnosis/${diagnosisId}`)
        │
        ▼
DiagnosisPage renders AnalysisProgress
        │
        ├── SSE: rca_progress events → diagnosisStore.updateProgress(step)
        │   (or) Polling: GET /api/diagnosis/:id/progress
        │
        ▼ (when all steps done)
diagnosisStore.fetchResult(id)
        │
        ├── GET /api/diagnosis/:id  →  populates rootCause, actions, etc.
        │
        ▼
DiagnosisPage renders Result view
 ┌──────┼───────┐──────────┐───────────┐
 │      │       │          │           │
QueryHeader  RootCause  Impact  Actions  Geographic
                                         │
                                    ChatInterface
```

### 7.2 SSE Event → Store → UI Update

```
Backend SSE Stream (GET /api/events/stream)
        │
        ▼
sseClient.ts (in useSSE hook)
        │
        ├── 'anomaly_detected'  →  dashboardStore.addAnomaly(data)
        │                              → LiveSignalsFeed re-renders
        │
        ├── 'rca_progress'      →  diagnosisStore.updateProgress(step)
        │                              → AnalysisProgress re-renders
        │
        ├── 'rca_completed'     →  diagnosisStore.fetchResult(id)
        │                              → DiagnosisPage switches to result
        │
        └── 'action_created'    →  diagnosisStore (refresh actions array)
                                       → RecommendedActionsCard re-renders
```

### 7.3 Chat Flow

```
User types in ChatInput → onSubmit
        │
        ▼
chatStore.sendMessage(diagnosisId, text)
        │
        ├── Adds user message to messages[]
        ├── Sets isTyping = true
        ├── POST /api/diagnosis/:id/chat { text }
        │
        ▼
Backend processes (Layer 4 Agent)
        │
        ├── Returns ChatMessage (with citations)
        │   (or SSE pushes bot response)
        │
        ▼
chatStore.addBotMessage(response)
        ├── Sets isTyping = false
        ├── Appends to messages[]
        │
        ▼
ChatInterface re-renders with new message
```

---

## 8. Design System Tokens (index.css)

These map to the existing artifact's CSS variables and will be defined using Tailwind v4's CSS-first configuration:

```css
@import "tailwindcss";

@theme {
  /* Typography */
  --font-serif: "Instrument Serif", serif;
  --font-sans: "Inter", sans-serif;
  --font-mono: "JetBrains Mono", monospace;

  /* Colors — Canvas */
  --color-canvas: #FAFAFA;
  --color-ink: #121212;
  --color-ink-muted: #666666;
  --color-border: #E5E5E5;

  /* Colors — Accents */
  --color-aurora: #7C3AED;        /* violet */
  --color-solar: #FB923C;         /* orange */
  --color-signal-critical: #DC2626;
  --color-signal-warning: #EA580C;
  --color-signal-info: #2563EB;
  --color-signal-success: #059669;
}
```

---

## 9. Build Sequence

### Step 1: Project Initialization
- `npx create-vite@latest frontend --template react-ts`
- Configure `vite.config.ts` with path aliases (`@/`)

### Step 2: Install Dependencies
```bash
# Core styling
npm install tailwindcss @tailwindcss/vite

# shadcn/ui prerequisites
npx shadcn@latest init

# Charts
npm install recharts tremor  # (or @tremor/react)

# Animation
npm install framer-motion

# State + Routing
npm install zustand react-router-dom

# Icons
npm install lucide-react
```

### Step 3: Foundation Layer
1. `src/index.css` — Design tokens, fonts, global styles
2. `src/lib/utils.ts` — `cn()` helper
3. `src/types/` — All TypeScript interfaces

### Step 4: Services & Stores
1. `src/services/api/client.ts` — Base API client
2. `src/services/api/*.ts` — All endpoint modules (returning mock data initially)
3. `src/services/sse/sseClient.ts` — SSE template
4. `src/stores/*.ts` — All Zustand stores

### Step 5: Layout Shell
1. `BackgroundAurora.tsx`
2. `Sidebar.tsx` + sub-components
3. `PageHeader.tsx`
4. `AppShell.tsx`
5. `App.tsx` — Router setup

### Step 6: Dashboard Page
1. `RevenueAtRiskChart.tsx`
2. `LiveSignalsFeed.tsx` + `AlertItem.tsx`
3. `DiagnosisSearchBar.tsx`
4. `DashboardPage.tsx` — Assembles everything

### Step 7: Diagnosis Page
1. `AnalysisStep.tsx` → `AnalysisProgress.tsx`
2. `QueryHeader.tsx`
3. `RootCauseCard.tsx`
4. `BusinessImpactCard.tsx` (uses `StatBox`)
5. `RecommendedActionsCard.tsx` + `ActionItem.tsx`
6. `GeographicOpportunityCard.tsx`
7. `DiagnosisPage.tsx` — Manages analyzing↔result transition

### Step 8: Chat Components
1. `ChatMessage.tsx` + `TypingIndicator.tsx`
2. `ChatInput.tsx`
3. `ChatInterface.tsx`

### Step 9: Sources Page
1. `SourceCard.tsx` + `AddSourceCard.tsx`
2. `SourcesPage.tsx`

### Step 10: SSE Integration & Polish
1. Wire `useSSE` hook into `AppShell`
2. Verify store→component reactivity
3. Polish animations, responsive breakpoints, transitions

---

## 10. Mapping to Design Doc Layers

| Design Doc Layer | Frontend Representation |
|---|---|
| **Layer 1: Data Intake** | `SourcesPage` + `sourcesStore` + `services/api/sources.ts` |
| **Layer 2: Normalization** | Handled entirely by backend; frontend consumes normalized data |
| **Layer 3: Anomaly Detection** | `LiveSignalsFeed` + `RevenueAtRiskChart` + `dashboardStore` + `services/api/anomalies.ts` |
| **Layer 4: Agentic RCA Core** | `AnalysisProgress` + `RootCauseCard` + `diagnosisStore` + `services/api/diagnosis.ts` |
| **Layer 5: Action & Orchestration** | `RecommendedActionsCard` + `ActionItem` + `services/api/actions.ts` |
| **Layer 6: User Interaction** | Everything in `components/`, `pages/`, `stores/`, `ChatInterface` |

---

## 11. Environment Variables

```env
# .env
VITE_API_BASE_URL=http://localhost:3001/api
VITE_SSE_URL=http://localhost:3001/api/events/stream
```

These will be the only config needed to point the frontend at a real backend.
