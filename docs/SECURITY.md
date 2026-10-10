# Security

Hackathon-level controls that are implemented:

- **Secrets** stay server-side. `.env*` is gitignored except `.env.example`. The Supabase service-role key is never `NEXT_PUBLIC_`. The public web host holds no AWS credentials (AI Lambda with a least-privilege role).
- **Database**: RLS enabled on every table with no policies, so the publishable key reads nothing. Helper functions are executable by the service role only. No SQL is built from user input.
- **Input validation**: every route parses with a Zod schema from `lib/schemas/api.ts`. AI output is validated against `ModelEvidenceSchema` before use.
- **Uploads**: 4 MB limit, JPEG/PNG/WebP allowlist, magic bytes must match the declared type.
- **SSRF**: media is fetched only from Twilio hosts over https, with manual redirect handling re-checked per hop and a streamed size cap. Arbitrary `mediaUrl` values are stored, never fetched.
- **Webhooks**: Twilio requests require a valid `X-Twilio-Signature`; n8n routes require `x-aquapulse-secret` (timing-safe). If the secret is not configured the routes return 503 rather than accepting anything.
- **Idempotency**: reports are keyed by `message_id` (Twilio `MessageSid`); duplicates return the stored row.
- **Rate limiting**: per-IP, in memory, on `/api/evidence` and `/api/ask` (per instance only).
- **Prompt injection**: citizen text and any text inside images are passed as untrusted evidence; the system prompt forbids following them. Ask AquaPulse answers only from supplied context. Model output never becomes a number shown as a result.
- **Bounded AI**: fixed max tokens, timeouts, limited retries.
- **Logs**: one JSON line per operation with request id, duration and status. No secrets, image bytes or full account ids. Phone numbers are stored only as SHA-256 hashes.

Not done: authentication for operators (the demo UI is open), distributed rate limiting, malware scanning of uploads.

## Added 2026-10-10
- `/api/state` requires the server secret. The browser mirrors demo progress through `/api/demo/sync`, which takes only a scenario id and step count; the server replays the scenario and writes the rows, so no caller-supplied state is stored.
- Rate limits are counted per route and per client address.
- `/api/reports` is a public, rate-limited read of inbound report text and location for the console; it carries no reporter identity.
- Twilio live mode sends only to numbers in `TWILIO_ALLOWED_TO`; alerts are claimed by idempotency key before sending.
- The Lambda's role has no Bedrock permission unless a model is configured. The client bundle was scanned for the service-role key, webhook secret and Lambda secret: none present.
