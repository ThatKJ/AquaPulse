# Contributors

The team behind **AquaPulse**:

| Contributor | Role & Key Contributions |
| :--- | :--- |
| **Kirtan Patel** ([@ThatKJ](https://github.com/ThatKJ)) | **Project Lead & Core Engine**<br>• Designed the deterministic HydroTwin simulation engine (`lib/simulation`, `lib/optimization`)<br>• National hydro-meteorological ingestion pipeline (NDMA SACHET + IMD Nowcasts)<br>• WebGL map visualizations with MapLibre & Deck.gl<br>• Scenario workflows & evidence scoring engine |
| **Het Ukani** ([@het](https://github.com/het)) | **Cloud Architect & AWS Infrastructure**<br>• AWS Cloud Architecture & Infrastructure as Code (`infra/cdk`)<br>• Amazon SNS emergency broadcast & multi-channel alert dispatch (`lib/aws/sns.ts`, `lib/alerts`)<br>• Amazon S3 durable evidence vault & content-addressed storage pipeline (`lib/aws/s3.ts`)<br>• Amazon CloudWatch Embedded Metric Format (EMF) operational telemetry (`lib/aws/telemetry.ts`)<br>• AWS Hackathon submission dossier & well-architected hardening |
