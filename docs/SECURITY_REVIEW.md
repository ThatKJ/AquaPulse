# Security review — 2026-10-11

Scope: the public deployment (`https://aquapulse-liard.vercel.app`), its API routes, the n8n workflows, the AI Lambda and the Supabase project. Method: code reading, live probes against production, a scan of the built client bundle, and the automated tests in `tests/webhook.test.ts`. Controls in place are described in `docs/SECURITY.md`; this file is the verdict.

| Area | Verdict | Evidence |
| --- | --- | --- |
| Write endpoints need authentication | PASS | Unauthenticated POSTs on production: `/api/state`, `/api/ingest/national`, `/api/ingest/sachet`, `/api/webhooks/{report,alert,verification,action-complete}` → 401; `/api/webhooks/twilio` → 403; `/api/demo/sync` with an unknown scenario → 400 (it accepts only a scenario id and step, and the server replays the scenario) |
| Twilio signature | PASS | HMAC-SHA1 over URL + sorted params, timing-safe compare. Bad or missing signature → 403 (tested, and probed on production directly and through n8n) |
| n8n trust | PASS | n8n holds no secret. AquaPulse accepts a signature for its own URL or for exactly one configured URL (`TWILIO_FORWARDER_URL`); another host or even a trailing slash → 403 (tested). `x-twilio-original-url` is ignored unless the caller holds the server secret (tested) |
| Replay / idempotency | PASS | A replayed signed message is stored once (`MessageSid` unique); alerts claim an idempotency key before sending |
| SSRF / media fetch | PASS | https only, Twilio hosts only, no port or userinfo, redirects followed by hand (max 3) and re-checked, Twilio's storage bucket allowed only as a redirect target, 10 s timeout, 4 MB streamed cap, type allowlist and magic-byte check. Localhost, RFC1918, link-local, IPv6 loopback/ULA and look-alike hosts are refused (tested). Credentials are sent to `api.twilio.com` only |
| Secrets | PASS | Built client bundle and `public/` scanned for the webhook secret, service-role key and Twilio token/SID values: none. None in tracked files. Only the Supabase URL and anon key are `NEXT_PUBLIC_` |
| Supabase | PASS | RLS enabled on all 22 application tables with no policies, so the anon key reads nothing; the server uses the service role. Only PostGIS's own `spatial_ref_sys` has RLS off (extension-owned). Queries go through supabase-js filters and RPCs with parameters; no SQL is built from input |
| AI Lambda | PASS | Function URL returns 401 without or with a wrong secret. Role: `rekognition:DetectLabels` plus its own log stream and events, nothing else. No Bedrock permission |
| XSS from citizen content | PASS | Report text is rendered as React text nodes only; no `dangerouslySetInnerHTML`, `innerHTML` or `setHTML` anywhere. Map labels come from engine and boundary data, not from reports |
| Logs | PASS | One JSON line per operation: ids, durations, status, Twilio error codes. No tokens, bodies or phone numbers. Senders are stored as keyed hashes (tested: the number does not appear in the row) |
| CORS | PASS | No `Access-Control-Allow-Origin` is sent; browsers on other origins cannot read the APIs |
| Response headers | PARTIAL | HSTS (platform), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` set. No Content-Security-Policy |
| Rate limiting | PARTIAL | Per route and client address, in memory per instance. Enough to stop accidental loops, not a determined client |
| Public read of reports | PARTIAL | `/api/reports` is public by design (the console polls it) and returns report text and coordinates, never the sender. A real deployment would put it behind operator sign-in |
| Operator authentication | RECOMMENDED_AFTER_HACKATHON | The console is open. Nothing in it writes to the server except the demo mirror described above |
| AWS root identity | RECOMMENDED_AFTER_HACKATHON | Deployments were done with a short-lived root session; the runtime uses the Lambda role. Steps: `docs/AWS_IAM_MIGRATION.md` |
| Bedrock | BLOCKED | Account restriction. Not used, not claimed |

Fixed in this review: security headers added; live reports that predate a console session can no longer change scenario numbers (a report sent shortly before a demo used to be merged into it).

Recommended after the hackathon, in order: operator sign-in and a private reports feed; a Content-Security-Policy; a shared rate limiter; rotate the Twilio token and webhook secret (they have lived on a development laptop); an IAM user or role for deployments.
