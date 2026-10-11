# AquaPulse — AWS Hackathon Submission

> **AI Decision Engine for Water-Resilient Indian Cities (Urban Flooding & Severe Scarcity)**  
> Track: Smart Cities, Disaster Resilience & AI for Social Good  
> AWS Region: `ap-south-1` (Mumbai)  
> Live Deployment: [aquapulse-liard.vercel.app](https://aquapulse-liard.vercel.app)  

---

## 1. Executive Summary

Every year, major Indian cities experience a devastating paradox: catastrophic urban flash flooding during the monsoon, followed immediately by severe drinking water scarcity in the dry season. The underlying root cause is fragmented, neglected infrastructure and delayed decision-making. 

During an urban water emergency:
1. **Officials** have raw alerts from national weather agencies in siloed portals.
2. **Citizens** post photos and messages across WhatsApp and social media.
3. **Engineers and field teams** have disconnected asset records and vehicle fleets.
4. **No unified system exists** to simulate interventions *before* committing limited crews, pumps, and emergency water tankers.

**AquaPulse** bridges this critical gap on AWS. It provides a real-time, closed-loop decision intelligence platform answering four life-saving questions on a single screen:
- **Where is the problem occurring?** (National situational awareness + street-level hexagonal HydroTwin)
- **Why is it happening?** (Visual evidence verification and infrastructure correlation)
- **What will happen next?** (Deterministic +15, +30, and +60 min predictive inundation and deficit forecasting)
- **What is the optimal response?** (Automated simulation and multi-objective ranking of pump, drain-clearing, and tanker deployments)

---

## 2. AWS Cloud Architecture

AquaPulse is engineered following AWS Serverless best practices to ensure high resilience during natural disasters when traffic surges:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   AQUAPULSE ON AWS                                     │
└────────────────────────────────────────────────────────────────────────────────────────┘

  [ Citizen WhatsApp / Web App ]                  [ Official Disaster Feeds ]
           │ (photo + GPS)                                │ (NDMA SACHET + IMD Nowcasts)
           ▼                                              ▼
  ┌─────────────────┐                             ┌───────────────────┐
  │  Twilio/Webhooks│                             │EventBridge Schedule│ (rate: 15 mins)
  └────────┬────────┘                             └─────────┬─────────┘
           │                                                │
           ▼                                                ▼
  ┌──────────────────────────────────────────────────────────────┐
  │                 AWS Lambda (Node.js 22.x)                    │
  │                  aquapulse-ai-fn (Mumbai)                    │
  │                                                              │
  │   • Secret-authenticated Function URL (No host credentials)  │
  │   • Least-privilege IAM Execution Role                       │
  └──────┬────────────────────┬────────────────────┬─────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │Amazon S3     │     │Amazon        │     │Amazon        │
  │Evidence Vault│     │Rekognition   │     │Bedrock       │
  │              │     │              │     │              │
  │• SSE-AES256  │     │• DetectLabels│     │• Converse API│
  │• Block Public│     │• Hazard Class│     │• Grounded LLM│
  │• Glacier Rule│     │• 80% discount│     │• Explanation │
  └──────────────┘     └──────────────┘     └──────────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                              ▼
  ┌──────────────────────────────────────────────────────────────┐
  │            Amazon Simple Notification Service (SNS)          │
  │              aquapulse-emergency-broadcast Topic             │
  │                                                              │
  │   • Multi-ward broadcast to Disaster Response Forces         │
  │   • Direct SMS to high-capacity pump & tanker drivers        │
  └───────────────────────────┬──────────────────────────────────┘
                              │
                              ▼
  ┌──────────────────────────────────────────────────────────────┐
  │               Amazon CloudWatch Telemetry & Ops              │
  │                                                              │
  │   • Embedded Metric Format (EMF) — Zero API cost telemetry   │
  │   • Exposed Population & Peak Hazard Alarms                  │
  │   • Real-Time Municipal Operations Dashboard                 │
  └──────────────────────────────────────────────────────────────┘
```

---

## 3. Key AWS Services & Capabilities

### 1. Amazon Rekognition
- **Role:** Real-time visual observer for citizen evidence photos.
- **Workflow:** Extracts labels and confidence percentages for water hazards (`Flood`, `Water`, `Drain`, `Sewer`, `Pipe`, `Mud`, `Debris`, `Rubble`).
- **Safety Rule:** Applies structured confidence discounting. Rekognition only labels what is visible—it does not invent causes or flood depths, ensuring explainability.

### 2. Amazon Bedrock
- **Role:** Grounded explainer for municipal operators.
- **Workflow:** Uses the `Converse` API with Amazon Nova or Claude models.
- **Deterministic Guardrails:** The LLM is strictly constrained to explain numbers produced by the deterministic engine; it is cryptographically barred from inventing operational figures.

### 3. AWS Lambda & Function URLs
- **Role:** Secure serverless execution boundary.
- **Security:** The public web host never holds AWS credentials. Invocations communicate with the Lambda Function URL via `x-aquapulse-secret` headers with constant-time cryptographic verification (`safeEqual`).

### 4. Amazon Simple Notification Service (SNS)
- **Role:** Emergency responder dispatch pipeline.
- **Workflow:** Broadcasts critical action directives (e.g., `Deploy Pump P-102 to Bellandur Outfall`) to municipal ward authorities and SMS endpoints with idempotency protection.

### 5. Amazon S3
- **Role:** Durable, encrypted media vault for disaster evidence.
- **Security & Efficiency:** Encrypted with S3-managed AES256, public access blocked, with automated lifecycle rules archiving evidence to Amazon S3 Glacier after 90 days.

### 6. Amazon EventBridge
- **Role:** Autonomous 15-minute scheduled sync.
- **Workflow:** Triggers national hydro-meteorological ingestion from NDMA SACHET and IMD feeds with automated retries and dead-letter handling.

### 7. Amazon CloudWatch & Embedded Metric Format (EMF)
- **Role:** Zero-overhead operational telemetry and disaster monitoring.
- **Workflow:** Emits structured JSON logs parsed directly into CloudWatch Metrics (`ExposedPopulation`, `PeakFloodRisk`, `AlertsDispatched`), powering real-time municipal alarms.

### 8. AWS Cloud Development Kit (CDK)
- **Role:** Complete Infrastructure as Code (IaC) in TypeScript located in `infra/cdk/`.
- **Reproducibility:** A single `npx cdk deploy` provisions the entire AWS environment with least-privilege IAM policies.

---

## 4. Well-Architected Framework Alignment

| Pillar | How AquaPulse Achieves It |
| :--- | :--- |
| **Security** | Zero AWS long-lived access keys on the web frontend. IAM least-privilege policies. Constant-time timing-safe secret comparisons. S3 public access blocked with SSE-AES256. |
| **Reliability** | The core prediction engine runs in the browser/edge without network dependencies. If AWS services degrade, the system gracefully falls back to deterministic templates and local caches. |
| **Performance** | Event-driven serverless architecture. CloudWatch EMF telemetry generates zero HTTP network overhead. In-browser hexagonal grid (H3) rendering via WebGL/deck.gl. |
| **Cost Optimization** | Pure serverless footprint. Base operating cost is under **$5/month**. Incident triage cost is ~$0.002 per citizen report. S3 lifecycle transitions reduce long-term storage costs by 80%. |
| **Sustainability** | Compute runs on-demand (zero idle server CPU cycles) in `ap-south-1` using energy-efficient AWS Graviton-compatible runtimes. |

---

## 5. Live Demo Guide for Hackathon Judges

1. **National Situational Awareness:**
   - Navigate to `/live` to view real-time NDMA SACHET alerts and IMD district nowcasts across all 700+ Indian districts.
2. **Street-Level Flood Scenario:**
   - Launch `/?demo=1&scenario=flood`.
   - Observe baseline: **3,822 residents exposed** to critical inundation at +30 minutes.
   - Run the decision engine: Evaluating combinations of pump and drain assets.
   - Outcome: Simultaneous deployment of high-volume pump P-102 and drain clearance D-104 reduces exposure from **3,822 down to 190** and saves the critical hospital facility.
3. **Emergency Alert Dispatch:**
   - Trigger the automated emergency alert to see Amazon SNS topic dispatch and CloudWatch telemetry in action.

---

## 6. Contributors

- **Kirtan Patel** ([@ThatKJ](https://github.com/ThatKJ)) — Core Decision Engine, HydroTwin Simulation & Fullstack Architecture
- **Het Ukani** ([@het](https://github.com/het)) — Cloud Architecture, AWS Serverless Infrastructure (CDK, S3, SNS, CloudWatch EMF) & Resilience Pipeline
