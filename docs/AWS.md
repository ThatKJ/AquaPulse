# How AquaPulse uses AWS

Region: Mumbai (`ap-south-1`). Setup and redeploy steps are in [AWS_SETUP.md](AWS_SETUP.md).

## What runs on AWS

```
Photo upload in the console ─► AquaPulse server ─► AWS Lambda ─► Amazon Rekognition
                                                       │
                                                       └─► Amazon CloudWatch (logs)
```

| Service | What it does here |
| --- | --- |
| AWS Lambda | One function, `aquapulse-ai-fn`. It receives a photo and asks Rekognition what is in it |
| Amazon Rekognition | `DetectLabels` returns labels with a confidence, for example "Flood 100%, Water 100%" |
| Amazon CloudWatch | One structured log line per request, kept for 14 days |
| IAM | A role for the function that allows `rekognition:DetectLabels` and writing its own logs |
| CloudFormation | The stack `aquapulse-ai` creates all of the above from `infra/ai-lambda/template.yaml` |

## Why a Lambda

The website runs on Vercel. We did not want AWS keys there. The Lambda has its own role, so the website only needs the function's address and a shared secret. If that secret leaked, the worst case is someone calling Rekognition through our function; they could not reach anything else in the account.

## How a photo is read

1. A photo is uploaded in the console (JPEG or PNG, up to 4 MB; the file type is checked against its contents).
2. The AquaPulse server sends it to the Lambda with the shared secret.
3. The Lambda calls Rekognition `DetectLabels`.
4. Fixed rules turn the labels into a finding. For example, "Flood" at 60% or more means waterlogging.
5. The result appears in the evidence panel with the badge "REKOGNITION · LIVE".

Rekognition tells us what is visible. It does not estimate the cause or the depth of water, and the result says so on screen. The evidence score that uses the result is calculated by the deterministic engine, not by a model.

## Security boundary

- The function's address rejects any request without the correct secret (401).
- The role has no S3, no Bedrock and no managed policies.
- Logs contain request ids, timings and status. They do not contain the secret or the image.
- The website holds no AWS credentials.

## What is not on AWS

- **Amazon Bedrock is not used.** It is blocked on this AWS account ("Operation not allowed"), which only AWS Support can lift. The question box in the app answers from templates over the engine's output and is labelled "not an LLM". If Bedrock is enabled later, the code path exists and is switched on by one setting.
- **Photos sent by WhatsApp do not reach Rekognition yet.** Twilio's trial account refuses the image download (error 20003). Text and location from WhatsApp work.
- **The 15-minute data refresh runs on n8n**, not AWS. An EventBridge schedule is written in the template but was never created.

## One caveat

The stack was deployed from a short-lived root session, because the account was new. The running function uses its own role, not root. Moving deployments to an IAM user is described in [AWS_IAM_MIGRATION.md](AWS_IAM_MIGRATION.md).
