# Scheduler plan — optional, REQUIRES_USER_APPROVAL

**Update 2026-10-11:** headless refresh now exists without AWS: an n8n schedule reads `/api/national` every 15 minutes (see `docs/N8N.md`). The EventBridge change set below is a second, independent trigger. It is still unexecuted and is no longer needed for the demo.

**Why:** the national feeds refresh only after someone reads `/api/national`. With no visitors the data goes stale.

**Change set:** `deploy-20261011-023903` on stack `aquapulse-ai` (ap-south-1). Created 2026-10-11, not executed. Change sets do not expire quickly, but re-preview if the template has changed since.

| Action | Resource | Purpose |
| --- | --- | --- |
| Add | `AWS::Scheduler::Schedule` `aquapulse-ai-national-ingest` | `rate(15 minutes)`; invokes the existing Lambda with `{"source":"aquapulse.scheduler"}` |
| Add | `AWS::IAM::Role` (scheduler) | Assumable only by `scheduler.amazonaws.com` from this account; `lambda:InvokeFunction` on `aquapulse-ai-fn` only |
| Modify (no replacement) | Lambda function | Two environment variables: ingest URL and secret |
| Modify ("conditional") | Function URL | Re-evaluated because the function changes; expected to stay the same. If it changed, `AI_ENDPOINT_URL` in Vercel must be updated |

- **Flow:** schedule → Lambda → `POST https://aquapulse-liard.vercel.app/api/ingest/national` with the server secret (401 without it, verified) → NDMA and IMD sync → Supabase.
- **Volume:** 96 invocations a day. The app's cadence rules mean at most 96 NDMA index fetches and 48 IMD fetches a day.
- **Cost:** effectively zero (EventBridge Scheduler and Lambda free tiers).
- **Overlap and failure:** the app's single-flight lock (`sync_runs`) makes overlapping or retried ticks harmless; it backs off after a failed sync; the last good data stays on screen and the header ages to DELAYED/STALE. The schedule retries twice and drops events after 10 minutes.
- **Rollback:** redeploy without `INGEST_URL` (removes the schedule and role), or delete the schedule.
- **Execute (after `aws login`):** `CHANGE_SET=deploy-20261011-023903 bash infra/ai-lambda/deploy.sh`
- **Verify:** stack `UPDATE_COMPLETE`; Function URL unchanged; public health AWS PASS; a `scheduled-ingest` line in CloudWatch; a `sync_runs` row not caused by a page visit.
