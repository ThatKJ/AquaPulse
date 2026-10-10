# AquaPulse AI Lambda

The public web host has no AWS credentials. It POSTs to this Lambda instead (`AI_ENDPOINT_URL` mode in
`lib/aws/clients.ts`), and the Lambda runs the same `lib/aws` code: Bedrock Converse first, Amazon Rekognition
`DetectLabels` as the fallback, a typed error otherwise. It never returns a fixture.

| Route | Body | Returns |
| --- | --- | --- |
| `POST /evidence` | `{ imageBase64, contentType, text? }` (JPEG/PNG/WebP, 4 MB max, magic bytes checked) | `EvidenceAnalysis` |
| `POST /ask` | `{ question, context }` (context 20 KB max) | `{ answer, source, modelId? }` |
| `POST /health` | `{}` | `{ aws, ai }` (one STS call, no inference) |

Every request needs the header `x-aquapulse-secret` (timing-safe compare). Errors are
`{ requestId, error: { code, message } }`.

## Deploy (not run yet: UNVERIFIED until someone does)

```bash
aws login                                             # the deploy needs a live CLI session
export AI_ENDPOINT_SECRET="$(openssl rand -hex 24)"   # keep it; the web host needs the same value
export BEDROCK_MODEL_ID="..."                         # from `npm run verify:bedrock`; omit for Rekognition only
PREVIEW=1 bash infra/ai-lambda/deploy.sh              # creates a change set, prints it, stops
CHANGE_SET=<printed name> bash infra/ai-lambda/deploy.sh   # executes exactly that change set, uploads the code
```

Then set `AI_ENDPOINT_URL` (printed at the end) and `AI_ENDPOINT_SECRET` on the web host.
`bash infra/ai-lambda/build.sh` alone only bundles to `dist/function.zip` and touches nothing in AWS.

## What the stack creates

- Lambda `aquapulse-ai-fn`, Node 22, 512 MB, 60 s timeout, reserved concurrency 2.
- Function URL, `AuthType: NONE`. The handler's shared-secret check is the gate.
- Role limited to `bedrock:InvokeModel` on foundation models and this account's inference profiles,
  `rekognition:DetectLabels`, and writing to its own log group (14-day retention).
- The secret is a `NoEcho` parameter stored as a Lambda environment variable: anyone who can read the
  function's configuration in this account can read it. Rotate by redeploying with a new value.

## Known limits

- If stack creation fails on `ReservedConcurrentExecutions` (new accounts have a total limit of 10 and cannot
  reserve), delete the failed stack and redeploy with `RESERVED_CONCURRENCY=-1`.
- The template's `InvokedViaFunctionUrl` permission has not been exercised on this account. If the change set
  rejects that property, remove the `UrlInvokePermission` resource.
- Function URL payloads cap at 6 MB; a 4 MB image is about 5.4 MB as base64, so the image limit must not grow.
- Tear down: `aws cloudformation delete-stack --stack-name aquapulse-ai --region ap-south-1`.
