# AquaPulse AWS CDK Infrastructure

Automated Infrastructure as Code (IaC) provisioning for AquaPulse on AWS.

## Architecture

This CDK stack deploys a production-ready, resilient serverless architecture in `ap-south-1` (Mumbai):

```
                   ┌───────────────────────────────────┐
                   │    EventBridge 15-min Schedule    │
                   └─────────────────┬─────────────────┘
                                     │ triggers refresh
                                     ▼
┌──────────────┐             ┌───────────────┐              ┌────────────────────────┐
│ Citizen App  │──POST photo─► Lambda AI URL ├─DetectLabels─► Amazon Rekognition     │
│ & WhatsApp   │             │   (Node 22)   ├─Store Media──► Amazon S3 Bucket        │
└──────────────┘             └───────┬───────┘              └────────────────────────┘
                                     │
                                     │ Publish Emergency
                                     ▼
                            ┌────────────────┐
                            │ Amazon SNS     ├──► Municipal Ward Responders
                            │ Emergency Topic├──► Water Tanker Drivers & Pumps
                            └────────────────┘
                                     │
                                     ▼
                            ┌────────────────┐
                            │ CloudWatch EMF ├──► Alarms & Operational Dashboard
                            └────────────────┘
```

## Provisioned AWS Resources

1. **Amazon S3 Evidence Bucket**:
   - AES256 server-side encryption
   - `BlockPublicAccess.BLOCK_ALL` and SSL enforcement
   - Automated lifecycle policy: Transitions images to S3 Glacier after 90 days, expires after 365 days.
2. **Amazon SNS Emergency Topic (`aquapulse-emergency-broadcast`)**:
   - High-throughput pub/sub for critical crisis broadcasts to municipal disaster management cells.
3. **AWS Lambda AI Observer**:
   - Secure Function URL (gated by `x-aquapulse-secret`)
   - Least-privilege IAM permissions (`rekognition:DetectLabels`, `bedrock:InvokeModel`, S3 read/write, SNS publish).
4. **Amazon EventBridge Scheduler**:
   - Automated 15-minute cron rule refreshing national hydro-meteorological feeds (NDMA SACHET / IMD).
5. **Amazon CloudWatch Dashboards & Alarms**:
   - Real-time operational dashboard for urban water risk, exposed population, and observer latency.
   - CloudWatch Alarm on elevated error rates.

## Deployment

```bash
cd infra/cdk
npm install

# Synthesize CloudFormation template
npx cdk synth

# Deploy to AWS account
npx cdk deploy
```

## Stack Outputs

After deployment, copy the output values into your `.env.local`:
- `AquaPulseStack.AiFunctionUrl` -> `AI_ENDPOINT_URL`
- `AquaPulseStack.EvidenceBucketName` -> `AWS_S3_EVIDENCE_BUCKET`
- `AquaPulseStack.EmergencyTopicArn` -> `AWS_SNS_TOPIC_ARN`
