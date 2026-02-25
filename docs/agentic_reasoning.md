# Agentic reasoning implementation Guide

## 🤖 The "Agentic" Philosophy
Our agents are not just wrappers around an LLM. They are **Autonomous Problem Solvers** that follow a structured scientific method:
**Observe -> Hypothesize -> Test -> Conclude -> Recommend.**

## 🧠 Strategic Reasoning Loop
1. **Trigger:** Layer 3 detects an anomaly (e.g., Revenue drops 20% in North Region).
2. **Context Injection:** The system gathers relevant metadata (Top selling SKUs, recent inventory changes, marketplace flags).
3. **Hypothesis Generation (AWS Bedrock):** 
   - Agent generates 3-5 possible reasons (e.g., "Top SKU #123 is out of stock", "Fulfilment delays at warehouse X").
4. **Data Verification (Agentic SQL/Querying):**
   - The agent requests specific data points to prove/disprove hypotheses.
   - It performs "Causal Scoring" to weigh the impact of each finding.
5. **RCA Summary:**
   - Agent synthesizes findings into a human-readable English explanation.
   - Assigns a **Confidence Score** (0.0 to 1.0).

---

## 🛠 Integration Details
### AWS Bedrock Config:
- **Model:** Claude 3.5 Sonnet.
- **System Prompting:** Focused on "Chain of Thought" reasoning and strictly avoiding hallucinations by grounding responses in provided data CSV snippets.

### Strands-Agents SDK:
- Used for managing multi-agent handoffs.
- Example: **Data Agent** gathers evidence -> **Analyst Agent** performs RCA -> **Manager Agent** generates the Final Action.

---

## 📝 Auditability & Transparency
Every decision made by the AI MUST be auditable.
- **Evidence Chain:** For every root cause, the system stores the raw data points that led to the conclusion.
- **Reasoning Log:** A chronologically ordered log of every prompt and response generated during the RCA process, accessible via the "History" tab in the dashboard.
