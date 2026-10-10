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
