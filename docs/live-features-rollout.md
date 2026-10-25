# Live activity and research alerts — rollout notes, 23 October 2026

## Behavior

- Admin console → Research pulse shows signed-in members, their roles, active/away status, and a unique-member count. A visible tab with an interaction in the past two minutes is active. Heartbeats run every 25 seconds; admin snapshots broadcast every 15 seconds. Sessions expire after 75 seconds without a heartbeat. Multiple tabs count as one member. Anonymous traffic is excluded.
- `/api/admin/presence` and live activity broadcasts require `students.view`. Failed/stale snapshots show unavailable counts, rather than a misleading zero. Disconnected admins fall back to polling.
- Suspension sends the account update before revoking sockets. A suspended member can reconnect only to their own account channel and public events; protected HTTP features remain blocked. `/api/auth/me` exposes their own account status so reloads and reinstatement work. Reinstatement restores the status before suspension. Historical suspensions without that field fall back to pending unless the record has completed verification. Verification cannot bypass a suspension.
- Ban reasons are validated, and suspensions/reinstatements create audit events. Socket reauthentication removes prior user/permission rooms; socket expiry is checked every 15 seconds and on heartbeats. HTTP and socket origins share one exact allowlist. The production thesis-archieve.vercel.app origin is included; configure additional origins explicitly.
- Follow this search opens a prefilled alert. Members with the existing topic-alert entitlement can follow all papers or theses only. Online checks sample up to 50 newest OpenAlex results published since the follow date, within a rolling 30-day window, applying the topic and selected type/discipline checks. This is sampled coverage; publication dates do not establish the moment a paper became available online. Source outages and truncated coverage are displayed.
- The server scans on startup and every 15 minutes. Enabled Radar ingestion also triggers alerts after successful batches and starts immediately. Browser notifications arrive over sockets, recover missed items on reconnect, and refresh every minute as a fallback. Alerts are in-app; browser push/background delivery while the browser is closed is not implemented.
- Ordinary OpenAlex topic scans work without Radar ingestion. Curated-venue follows still depend on `RADAR_INGESTION_ENABLED=true`, valid indexes, source availability and the existing venue configuration. Offline mode never sends sample provider results as real alerts.
- Scans update follow cursors without overwriting concurrently edited account/library data. Same-user requests share work within one process. Notification records retain deduplication data; repeated sampled papers are excluded. Multiple server processes would require a distributed per-user scan lease to prevent overlapping notification batches.

## Verification and limits

The backend's 33 deterministic suites include real local HTTP/socket connections with synthetic model persistence: ban/re-ban/unban, two-tab reinstatement, blocked protected requests, own-account status, privilege-room isolation, trusted/untrusted origins, presence deduplication/expiry and sampled online alert failures/deduplication. They do not exercise a production MongoDB deployment.

Frontend unit coverage includes live activity, source warnings, thesis follows, valid hyphenated Google client IDs, suspension recovery, temporary server failures and logout races. Browser coverage includes the existing discovery/library/dataset/citation flows plus admin suspend/reinstate, activity and prefilled thesis alerts at 320, 390 and 1440 pixels. Screenshots use explicitly synthetic test accounts, never live member activity. Lint has existing repository warnings; builds retain the existing lazy Excel-library size and FeedbackModal import warnings.

A live read-only OpenAlex query returned three records without an API error; matching still filters irrelevant source results. The public deployed site at https://thesis-archieve.vercel.app/ loaded and exposed Google sign-in. No authenticated live admin session was available, so live moderation, payments, private library, uploads and authenticated deployment behavior remain unverified. Paid AI, SMTP delivery and storage integrations were not exercised against production.

The backend transitive `ip-address` dependency was updated to a compatible patched release after npm reported GHSA-rxp7-6hxx-x8q5. The backend dependency audit then reported zero known vulnerabilities.

## Deploying

1. Deploy the backend and frontend together: the activity panel needs the new endpoint and socket handlers; updated clients recover suspension status through the updated account endpoint.
2. Confirm `VITE_API_URL`, Google OAuth origins and the backend's `FRONTEND_URL`/`CLIENT_ORIGIN` match the deployed addresses. Custom previews must be explicitly listed; arbitrary Vercel subdomains no longer pass CORS.
3. Run the backend continuously on a host that supports WebSockets and timers. A sleeping host delays scans. Serverless HTTP functions alone do not run these background loops reliably.
4. Keep `OFFLINE_MODE=false`. Configure the existing OpenAlex key if required by source access limits. Radar venue indexing remains separately opt-in; use the existing discovery index-preparation instructions before enabling it.
5. In staging, open two synthetic student tabs and an admin tab. Suspend/reinstate both pending and approved students, confirm blocked direct API access, and verify both tabs update. Check activity, source-failure messages and a saved follow notification. Check payments/uploads/SMTP/AI with their configured integrations separately.

No deployment, production-account modification, payment action, migration, or paid AI call was performed during this work.

Provider filter/sort contract: [OpenAlex filters](https://help.openalex.org/api/filtering/) and [OpenAlex sorting](https://help.openalex.org/api/sorting/).
