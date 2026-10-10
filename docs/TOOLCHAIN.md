# Toolchain

The smallest set of tools that builds, verifies and ships AquaPulse. Audited 2026-10-10. No secrets in this file.

## Selected

| Tool | Source | Kind | Purpose in AquaPulse | Auth | Permissions | Verified by | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ponytail | `ponytail@ponytail` Claude Code plugin | Third party | YAGNI guard on every change | None | Prompt/skills only | Session hook active | KEEP |
| Review skills (`/code-review`, `/security-review`) | Built into Claude Code (same upstream as OneRedOak's commands) | Official | Milestone code review; security review of diffs | None | Read repo | Code review run on server paths; security review done by reading the code because the command only covers unpushed diffs | KEEP |
| OneRedOak design-review method | `github.com/OneRedOak/claude-code-workflows` (method only, nothing installed) | Third party | Browser-first design review with a Blocker/High/Medium/Nit triage | None | None | Three review rounds logged in `docs/STATUS.md` | KEEP (as a method) |
| Playwright MCP | `playwright@anthropic-plugin-directory` → `npx @playwright/mcp@latest` (Microsoft) | Official | Browser verification, screenshots, scenario rehearsal, deployed-site checks | None | Drives a local browser; file access limited to the repo | Opened the app, read the header text, ran all three scenarios | KEEP |
| AWS CLI v2 | Amazon | Official | Identity check, Bedrock availability, Rekognition, CloudFormation deploy of the AI Lambda | `aws login` session | Whatever the session identity has (currently the account root user: see `AWS_SETUP.md`) | `aws sts get-caller-identity` | KEEP |
| Supabase connector | `mcp.supabase.com` | Official | Create project, apply migrations, run SQL checks, read advisors | Claude.ai connector OAuth | Org-level management of the user's projects | Migrations `init` and `external_incident_refs` applied; SQL checks run | KEEP |
| Supabase CLI | Supabase (Homebrew) | Official | Read the service-role key into `.env.local` (the connector does not expose it) | Existing CLI login | Org-level | `npm run verify:db` → `SUPABASE_OK POSTGIS_OK` | KEEP |
| git + GitHub CLI | Git / GitHub | Official | Version control, push to `ThatKJ/AquaPulse` | Existing `gh` login | Repo write | Pushes succeeded | KEEP |
| Vercel CLI (via `npx vercel`) | Vercel | Official | Preview and production deploys, env vars | Existing CLI login | Account deploy rights | `vercel whoami` returns the account | KEEP |
| Project scripts (`npm run doctor`, `verify:*`, `selfcheck`) | This repo | — | Real-call verification of each integration | Per integration | Per integration | Run output in `docs/STATUS.md` | KEEP |

## Considered and not adopted

| Tool | Why not |
| --- | --- |
| AWS MCP servers (`awslabs/mcp`: aws-api, aws-iac, aws-docs) | The AWS CLI already does every call this project needs (STS, Bedrock read, Rekognition, CloudFormation). An MCP would add install and auth work and a second path to the same root session, with no new capability. |
| Vercel MCP (`plugin:vercel`) | Installed globally but not authenticated. The CLI is already logged in and covers deploy, env and logs. |
| n8n skills / n8n instance MCP | There is no n8n instance to connect to (no n8n Cloud account configured, Docker daemon not running). Workflows are delivered as importable JSON in `n8n/` and documented in `docs/N8N.md`; connect the MCP after an instance exists. |
| Mapbox tooling | The app uses MapLibre with a keyless basemap. |
| GitHub Actions / PR bots | No PR flow in a one-day build. |

## Installed globally but unused by this project

These are user-level Claude Code plugins and connectors (design, figma, impeccable, ui-ux-pro-max, taste-skill, 21st, superpowers, swift-lsp, webgpu-threejs-tsl, i-have-adhd, andrej-karpathy-skills, stitch, and the Gmail, Calendar, Drive, Slack, Notion, Supademo and Claude Docs connectors). AquaPulse does not call any of them. They were left in place because they belong to the user's account and other projects; disable them per project with `/plugin` if a leaner session is wanted.

## Not available

| Tool | State |
| --- | --- |
| Docker daemon | Installed, not running (needed only for a local n8n) |
| Twilio | No account credentials configured |
| n8n | No instance |
