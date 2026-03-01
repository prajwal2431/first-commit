# Revenue at Risk (RAR) & Live Signals Logic

This document explains the backend logic used to compute "Revenue at Risk" and detect and categorize "Live Signals" in the Nexus Intelligence Platform.

---

## 1. Revenue at Risk (RAR) Logic

The RAR calculation uses a **Layered Decomposition** approach to quantify potential revenue loss and attribute it to operational failures.

### The RAR Formula
`RAR = Expected_Revenue - Actual_Revenue`

| Layer | Component | Description |
| :--- | :--- | :--- |
| **Layer A** | **Baseline Guidance** | Calculated using a 14-day rolling average adjusted for WoW (Week-over-Week) seasonality. This is what the business "expected" to achieve today/this week. |
| **Layer B** | **Actual Achieved** | The real revenue achieved in the current period ($A_{rev}$). |
| **Layer C** | **Attribution (The Leak)** | The gap ($E_{rev} - A_{rev}$) is decomposed into specific operational "leaks" using cross-referenced data. |

### RAR Attribution Buckets (The Leaks)

1.  **Inventory Leak:**
    *   **Logic:** Identified by cross-referencing SKUs with zero stock (`available_qty <= 0`) but high historical demand.
    *   **Calculation:** `Lost_Qty_Estimated * AOV`.
2.  **Conversion Leak:**
    *   **Logic:** Captures revenue lost when traffic exists but conversion rate ($CVR$) drops below baseline.
    *   **Calculation:** `(Baseline_CVR - Actual_CVR) * Sessions * AOV`.
3.  **Ops Leak:**
    *   **Logic:** Revenue booked but eroded by operational failures.
    *   **Calculation:** `(Returns + Cancellations) * AOV * Margin_Factor`.
4.  **Channel Mix Leak:**
    *   **Logic:** (Planned) Revenue shift away from high-margin channels to lower-margin ones.
5.  **Seasonal Shift/Adjustment:**
    *   **Logic:** Revenue variation explained by external factors like weather or festivals.

---

## 2. Live Signal Logic

Signals are "units of action" triggered using **Deterministic Anomaly Detection**. Users can customize these triggers in **Settings > Thresholds**.

### A. Revenue Signals

| Signal | Logic | Default Threshold |
| :--- | :--- | :--- |
| **WoW Revenue Drop** | Triggered if current week's revenue is $X\%$ lower than previous week. | 15% |
| **DoD Revenue Drop** | Triggered if today's revenue is $X\%$ lower than yesterday. | 10% |
| **Traffic↑ CVR↓** | **Critical.** Detects rising traffic (>10%) but falling revenue (<-10%). Indicates checkout bugs or pricing mismatches. | Multi-factor |
| **AOV Collapse** | Detects a sudden drop in Average Order Value, suggesting margin erosion. | 15% |
| **Top SKU Drop** | Monitors top 20 revenue-driving SKUs. Fires if any single SKU drops significantly. | 20% |

### B. Inventory Exposure Signals

| Signal | Logic | Default Threshold |
| :--- | :--- | :--- |
| **Critical Stockout** | SKU is OOS AND has "High Demand" (e.g., >10 units/day recently). | - |
| **Systemic OOS Rate** | Percentage of the entire catalog that is out of stock. | 5% (Warn), 10% (Crit) |
| **Regional Mismatch** | SPIKE in regional orders (e.g. Delhi) but ZERO inventory in that regional warehouse. | - |

### C. Operational Breakdown Signals

| Signal | Logic | Default Threshold |
| :--- | :--- | :--- |
| **Return/RTO Spike** | Combined rate of Returns + Return-to-Origin (RTO) exceeds threshold. Attributes to worst carrier. | 5% (Warn), 15% (Crit) |
| **SLA Adherence Drop** | Delivery delays exceeding expected window. | <90% (Warn), <80% (Crit) |
| **Cancellation Spike** | Sudden rise in pre-delivery customer cancellations. | 3% (Warn), 10% (Crit) |

### D. Demand Spike Signals

| Signal | Logic (Z-Score) |
| :--- | :--- |
| **Statistical Spike** | Fires if `Daily_Units > Mean + (multiplier * StdDev)`. Default multiplier: **2.0σ**. |
| **SKU Viral Spike** | Fires if a single SKU moves >2.5x its average velocity. |

#### Demand Attribution Filter
Every demand spike is run through a context filter to explain the "Why":
*   **Festival driven:** Cross-referenced with `festival_calendar.json`.
*   **Weather driven:** Detects temp shifts > 5°C or rainfall > 20mm.
*   **Organic:** Unexplained spikes (likely influencer-driven or viral).

---

## 3. Signal Scoring & Confidence

Every signal includes a **Confidence Score (0-100%)**:
*   **High Confidence:** 14+ days of history, multiple carrier data points, verified regional stock levels.
*   **Medium/Low Confidence:** Recent history, inferred data points, or high statistical variance.

## 4. User Configuration

All thresholds driving this logic are fully configurable by the user in the **Settings > Thresholds** pane. Saving changes triggers an immediate re-computation of all monitors to ensure the Intelligence Hub reflects the latest business priorities.
