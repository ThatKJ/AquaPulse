# Decisions

1. **Single Next.js app, no packages.** One day; nothing needs a second deployable except the AI Lambda.
2. **The demo runs in the browser.** A pure, deterministic TypeScript engine plus a seeded `WorldState` render and play every scenario with no network. AWS, Supabase and Twilio add real integration but can never break the judge demo.
3. **Numbers come from the engine, words may come from an LLM.** Exposure, risk, cost and rankings are computed by simulation. Bedrock explains them (Ask AquaPulse) and observes images (EvidenceAnalysis); it never produces a number the UI presents as a result.
4. **Explainable cell model, not hydrodynamics.** Weighted factors per H3 cell with neighbour propagation by elevation proxy. Coefficients live in one config object.
5. **H3 resolution 9 over one district.** A few hundred cells render and re-simulate fast enough for hover previews.
6. **Synthetic infrastructure is labelled.** Roads and buildings are real basemap data. Drains, pipes, pumps, facilities, populations and history are SIMULATED and carry that provenance into the UI.
7. **MapLibre + deck.gl with a keyless dark basemap.** No map token to manage. No Three.js.
8. **AI observer chain: Bedrock Converse, then Rekognition.** Converse is model-agnostic (Claude or Nova), so the model id is configuration. Rekognition is the live fallback because Bedrock was refused on this account in September. The `source` field on every analysis drives the UI badge; fixtures are a separate, labelled path.
9. **Public site reaches AWS through one Lambda.** The web host holds no AWS credentials; it calls a Lambda (least-privilege role) with a shared secret.
10. **Postgres + PostGIS with `geography` columns.** Distances are meters by construction. No graph database: relationships are rows.
11. **RLS on, no policies.** Only the server (service role) touches tables; the publishable key can read nothing.
12. **Four explicit integration states** (PASS / FAIL / NOT_CONFIGURED / UNVERIFIED) everywhere a connection is reported.
13. **Workflow adapted from OneRedOak/claude-code-workflows:** context file + status file, quick visual check after UI changes, milestone code/security/design reviews with a Blocker/High/Medium/Nit triage. Skipped: GitHub Actions, PR bots, custom agent files.
