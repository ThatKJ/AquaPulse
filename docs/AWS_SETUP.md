# AWS setup

Region: `ap-south-1`. Nothing below needs keys in a file: local development uses the AWS CLI session.

## 1. Verify identity
```bash
aws login            # browser sign-in; sessions are short-lived
npm run verify:aws   # STS GetCallerIdentity, prints AWS_IDENTITY_OK and a masked account
```
The current identity is the account root user. That is acceptable for this hackathon's read and inference calls; use an IAM role or user for anything longer-lived.

## 2. Verify the AI observer
```bash
npm run verify:bedrock
```
Makes exactly one Bedrock Converse call (model from `BEDROCK_MODEL_ID`, or the first discovered candidate), then one Rekognition `DetectLabels` call if Bedrock fails. It classifies Bedrock failures: expired credentials, IAM denial, Anthropic use-case form, account-level restriction, wrong model id, region/inference profile, marketplace, throttling.

**Result on this account, 2026-10-10:** Bedrock returns `ValidationException: Operation not allowed` (account-level restriction; `get-foundation-model-availability` reports `NOT_AUTHORIZED` for Claude and Nova, and the Anthropic use-case form is not filled). Only AWS Support can lift it. Rekognition `DetectLabels` works and is the live observer. Leave `BEDROCK_MODEL_ID` blank.

If Bedrock is later enabled: set `BEDROCK_MODEL_ID` to an inference profile id printed by the script, rerun it, and both `/api/evidence` and `/api/ask` switch to Bedrock with no code change.

## 3. What each mode does
| | Evidence photo | Ask AquaPulse |
| --- | --- | --- |
| Bedrock works | Converse with image, JSON validated by Zod, badge `bedrock` | Grounded LLM answer, badge `bedrock` |
| Bedrock blocked (today) | Rekognition labels mapped by fixed rules, badge `rekognition` | Deterministic template from simulation data, badge `template` |

Rekognition reports labels and confidences only. It does not estimate cause or depth, and the analysis says so.

## 4. Public host
The web host has no AWS credentials. Deploy the AI Lambda (`infra/ai-lambda/README.md`, preview a change set first) and set `AI_ENDPOINT_URL` and `AI_ENDPOINT_SECRET` on the host. Not deployed yet.

## 5. One view
```bash
npm run doctor            # no Bedrock inference by default
npm run doctor -- --live  # spends one Bedrock call
```

## 6. Deployed AI Lambda (2026-10-10)
Stack `aquapulse-ai`, ap-south-1: function `aquapulse-ai-fn` (Node 22, 512 MB, 60 s), a Function URL gated by the shared secret, a role limited to `rekognition:DetectLabels` and its own logs, and a 14-day log group. No reserved concurrency (the account's limit of 10 does not allow one). The Bedrock permission is added by the template only when `BEDROCK_MODEL_ID` is set.

- Redeploy: `PREVIEW=1 AI_ENDPOINT_SECRET=… RESERVED_CONCURRENCY=-1 bash infra/ai-lambda/deploy.sh`, read the change set, then `CHANGE_SET=<name> bash infra/ai-lambda/deploy.sh`.
- Verify: `npm run doctor` (reads the public site's `/api/health`, which reports the Lambda's identity and observer).
- Remove: `aws cloudformation delete-stack --stack-name aquapulse-ai --region ap-south-1`.
- The web host (Vercel) holds `AI_ENDPOINT_URL` and `AI_ENDPOINT_SECRET`; it has no AWS credentials.

## 7. Scheduled national ingestion (prepared, not created)
`infra/ai-lambda/template.yaml` adds, only when `INGEST_URL` is supplied:
- `AWS::Scheduler::Schedule` `aquapulse-ai-national-ingest`, `rate(15 minutes)`, retry 2, max event age 10 min.
- An IAM role assumed by `scheduler.amazonaws.com` (restricted to this account) with `lambda:InvokeFunction` on `aquapulse-ai-fn` only.
- Two Lambda environment variables (`INGEST_URL`, `INGEST_SECRET`). The function's own role is unchanged.

The tick invokes the existing function with `{"source":"aquapulse.scheduler"}`; the function POSTs to the web app's `/api/ingest/national` with the server secret. The app holds the sync logic and the single-flight lock, so overlapping or retried ticks are harmless.

Deploy (after approval): `aws login`, then
`PREVIEW=1 RESERVED_CONCURRENCY=-1 AI_ENDPOINT_SECRET=… INGEST_URL=https://aquapulse-liard.vercel.app/api/ingest/national INGEST_SECRET=… bash infra/ai-lambda/deploy.sh`, read the change set, then execute it with `CHANGE_SET=<name>`.
