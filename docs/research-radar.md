# Research Radar audit and implementation handoff

Project Panther now has an authenticated external-paper discovery feed and a responsive Research Radar, implemented on `codex/research-radar`. The existing thesis archive, account verification, RBAC, membership, payments, uploads, library, PDF reader and AI entitlements remain in place. No deployment, database migration or ingestion against a database was performed.

## Reliability follow-up: current implementation

This section supersedes the initial UI and test counts below. The follow-up was made in the existing checkout at `E:\project panther`, preserving both the first Radar implementation and unrelated work. Baseline backend checks passed all 32 suites and baseline frontend checks passed 4 tests. No existing failing suite was observed.

### Root causes and corrected journeys

- Radar reads `DiscoveryPaper`, while broad searches use the catalog and providers. Indexing is explicitly disabled by default and the timer waits for its first interval. A browser refresh cannot populate the index. Database contents were not inspected; the observed deployment's precise state cannot be established from this checkout alone.
- The previous screen labeled the number of persisted `DiscoverySync` documents as configured jobs. New diagnostics derive configuration from `jobsFor`, join saved states, and represent never-attempted jobs as waiting. Zero saved states no longer means zero configured sources.
- A 30-day default excluded year-only conference records. The default now browses the current publication year, explicitly labeled with the year. Short windows still require verified days; no dates are fabricated. ICCV accepts odd-year editions and ECCV accepts even-year editions. Changing venues clears an incompatible edition with an explanation. The annual ICCV view offers an explicit latest-edition action in even years.
- A missing index previously looked like an ordinary search miss. It now says “Research Radar is getting ready.” and offers a working catalog handoff. An initialized index with no filter matches has distinct clear-filter and annual-view actions. Indexing-activity misses explain the limits of tracked sources. Outages retain earlier cards and offer Retry; permission errors explain approved-account access.
- Navigation now reads **Find papers / Latest research / Check my idea / Datasets / Library**, with consistent active styling and purpose descriptions. Research Radar retains its page identity. The local trend panel is labeled “Archive topic activity.”
- Radar hands its current raw keyword, venue and explicit edition to Find papers while clearing incompatible institution/type/resource filters. Radar and Find papers can prefill an idea without submitting it. Supporting-literature handoffs preserve the billing context and clear stale catalog filters.
- Hidden tabs previously could trigger catalog searches, and unmounting reset Radar filters and analysis progress. Catalog effects are guarded by the active view; explicit Search submissions have a revision trigger, including repeated identical queries. Radar and idea-check components remain mounted after first use, with hidden Radar requests paused/cancelled. Tab navigation does not submit an idea or generate AI summaries.
- Radar filters now have their own URL parameters (`rq`, `rv`, `rr`, `rm`, `rp`, `ry`) and restore through back/forward. They do not reuse incompatible catalog parameters.
- Following previously used delayed input. It now submits the input visible at click time, distinguishes duplicates and allowance errors, and explains that notifications depend on indexed coverage. The backend checks duplicates before quota rejection and conditionally appends under both duplicate and size constraints, preventing concurrent inserts from bypassing the allowance.
- Idea-check conclusions now identify keyword matching as a heuristic. Partial coverage with no close matches yields “Limited evidence,” and missing matches never establish originality. Reports expire after 15 minutes, are scoped by account/topic/university, and partial reports can be retried. Persisted recent-topic history is account scoped; the old unscoped history is not reused. A refinement is not sent if the first response lacks a billing context.

### Safe feed contract

The authenticated, approved-account-only `GET /api/research/radar` retains `records`, `sync`, `venues`, `basis`, `mode` and `nextCursor`. It adds `health` with `state`, `ingestionEnabled`, `hasIndexedPapers`, `configuredJobs`, `failedJobs`, `lastSuccessAt` and `stale`. No credentials, provider errors, lease internals or private user records are exposed. Reads remain cached for at most 60 seconds; successful synchronization invalidates the local feed cache.

States are `disabled`, `waiting`, `syncing`, `indexed`, `partial_failure` or `stale`. Index presence is determined independently of the current filter. An expired syncing lease becomes an interrupted source state and counts as a failure. Staleness uses a 48-hour threshold; source rows expose their own last-success times. This is global index health, not a completeness guarantee for a selected topic. Provider jobs may succeed with zero accepted records. Counts in the UI say “papers loaded,” not an unsupported total-result count.

Jobs and years remain bounded by the existing configuration. The new annual-view compound index supports year filtering and stable publication-date/ID ordering. Declaring the index in code does not create it in an existing deployment until the index-preparation step is run.

### Follow-up file inventory

Paths below are relative to the existing checkout `E:\project panther`:

- `backend/services/discoveryFeed.js`: annual defaults, edition validation, configured-source health and read contract.
- `backend/models/DiscoveryPaper.js`: annual-view index.
- `backend/routes/user.js`: duplicate-first follow checks and conditional quota-safe append.
- `backend/tests/discoveryRadar.test.js`: health/default/edition regressions and integration entry point.
- `backend/tests/radarFollows.test.js`: authenticated follow-route tests with deterministic persistence and entitlement fixtures.
- `frontend/src/App.jsx`: research handoffs, mounted tool state, history, hidden-search guard and explicit repeated-search trigger; publisher response shape protection.
- `frontend/src/components/Header.jsx`: consistent five-destination navigation.
- `frontend/src/components/ResearchRadar.jsx`: useful defaults, advanced controls, edition guidance, pagination cancellation and immediate follow input.
- `frontend/src/components/RadarAvailability.jsx`: health, coverage, counts and working empty-state actions.
- `frontend/src/components/ResearchSuggestionInput.jsx`: explicit Radar-filter wording.
- `frontend/src/components/TopicTrendRadar.jsx`: distinct archive-activity label.
- `frontend/src/components/TopicCheck.jsx`: evidence limits, account-scoped history/report cache, partial-source analysis, preserved progress and supporting-literature action.
- `frontend/src/components/TopicAlertsModal.jsx`: scan/load failures and source-coverage wording.
- `frontend/src/components/CiteModal.jsx`: accessible citation-dialog semantics.
- `frontend/src/utils/topicAnalysis.js`: cautious evidence-based verdict wording.
- `frontend/src/utils/urlState.js`: separate Radar deep-link state.
- `frontend/src/utils/venues.js`: readable venue names.
- `frontend/tests/radar.test.jsx`, `frontend/tests/workflow.test.jsx`: component, analysis and URL-state regressions.
- `frontend/e2e/radar.spec.js`, `frontend/playwright.config.js`: browser journeys, six widths, isolated preview and screenshots.
- `README.md`, `docs/research-radar.md`, `docs/screenshots/radar-desktop.png`, `docs/screenshots/radar-mobile-dark.png`: current test count, handoff and visual evidence.

### Current verification and practical limits

- In `backend`, `npm test`: **32 deterministic suites passed**, including original checks, health/default/edition cases, source failures, normalization, cursors, authenticated access, follow duplicates and quota-safe concurrent-request fixtures.
- In `frontend`, `npm test`: **15 tests passed** across Radar and workflow suites. Coverage includes uninitialized/filter-miss/partial states, context transfer, immediate following, duplicate/allowance errors, stale response suppression, cancellation, deduplication, hidden-feed behavior, alternate editions, keyboard suggestions, deep-link round trips and partial idea-check evidence.
- In `frontend`, `npm run lint`: **exit 0**, with repository warnings and additional effect-state/dependency warnings in the research integration. This is not a warning-free lint result.
- In `frontend`, `npm run build`: **passed**, including the offline shell. Existing Excel chunk-size and FeedbackModal import warnings remain.
- In `frontend`, `npm run test:e2e`: browser tests cover save/compare/read/cite, preserved failed refresh, uninitialized catalog handoff, quota-free idea transfer, Radar history, analysis across tabs, keyboard venue suggestions and dark mode. All five navigation destinations and page overflow are checked at 320, 375, 390, 768, 1024 and 1440 pixels in both themes. **12 tests passed in 15.6 seconds; exit 0.** The Windows preview launcher calls Vite directly, avoiding an npm child-process shutdown hang.

Development failures were corrected (the final checks pass): ambiguous combobox selectors in component tests, an object-identity assertion that ignored normalized deduplication, an unsupported browser-test locator, and an idea-check test that clicked navigation before the lazy form mounted. Browser verification also caught the old mobile menu left by an initial navigation edit and missing citation dialog semantics; both were fixed. The fixture publisher response used the wrong endpoint and was corrected; the client now also validates the response shape.

Screenshots show explicitly labeled synthetic browser fixtures, not live indexed publications. Backend persistence fixtures check query contracts and route behavior, not actual MongoDB atomicity or installed indexes. Real ingestion, deployed account flows, notification scheduling, payments and paid AI were not exercised. The earlier read-only CVPR/JMLR checks remain the only live-provider evidence; OpenReview previously returned 403, and other providers remain staging gates. No production data was changed and ingestion remains opt-in.

### Staging rollout and rollback

1. Obtain an explicitly approved staging MongoDB target and supply `MONGODB_URI` through the operator's secure environment. Neither maintenance script loads `.env` or guesses a database. Do not point these commands at production without separate authorization.
2. Run `node backend/scripts/prepareDiscoveryIndexes.js` against that staging target. Confirm the unique identity/job/notification indexes and the new annual compound index. Resolve duplicate-key problems before enabling scheduling; do not drop data to force index creation.
3. Keep scheduled ingestion disabled. For a controlled first batch, set `RADAR_YEARS` to the intended editions, `RADAR_BATCH_SIZE=2` and `RADAR_JOBS_PER_RUN=1`, then run `node backend/scripts/syncDiscovery.js`. This is an explicit operator-triggered write. Inspect actual normalized source records and sync receipts, then repeat bounded batches as appropriate; a single small batch does not establish full venue coverage.
4. Sign in with an approved staging account. Verify annual cards, exact-date short windows, recent indexing activity, alternate-year editions, source failure recovery, actual saved-paper retrieval and notification deduplication. Test concurrent follows against real MongoDB and inspect query plans for annual/text queries.
5. Investigate deployment-network source failures, especially OpenReview's earlier 403, without bypassing access controls. Enable `RADAR_INGESTION_ENABLED=true` only after source and database checks. The first scheduled batch starts after the configured interval, not immediately. Monitor source timestamps, failed/interrupted jobs, queue progress and notification volume.
6. Roll back by disabling scheduled ingestion immediately and restoring the prior reviewed application release. Retain the separate discovery collections and optional user/notification fields; this upgrade requires no destructive rollback migration. Process-local health may take up to 60 seconds to refresh.

## Repository baseline

The working tree already contained research workspace tools, caching, resource filters, autocomplete, public collections and offline-library work. These changes were retained. The root README and frontend README, repository inventory, search and provider services, models, routes, security middleware, primary React flows and test runner were inspected before implementation. The original 31 deterministic backend suites passed after clean dependency installation.

Because the starting tree was dirty, changes are left uncommitted on the new branch. A diff against `main` also includes the work that predates this upgrade. Review the file inventory below before preparing commits.

## Confirmed findings and changes

1. **Venue discovery was absent.** `backend/services/queryParser.js` parsed provider and publisher filters but no venue. `backend/services/searchSessionManager.js`, `normalizeSessionFilterKey`, also had no venue component. Venue is now independently validated, included in session identity, and checked against record metadata. `frontend/src/components/DiscoveryFiltersPanel.jsx` supplies a separate venue selector, with URL state and removable chips in `frontend/src/App.jsx` and `frontend/src/utils/urlState.js`. DBLP requests include venue constraints. Other federated adapters still depend on the returned sample and metadata; this does not guarantee exhaustive conference search.

2. **The existing radar measured local additions.** `frontend/src/components/TopicTrendRadar.jsx` and `/api/research/trends` in `backend/routes/research.js` count approved local theses. That feature remains. `backend/models/DiscoveryPaper.js` now stores external records separately; `frontend/src/components/ResearchRadar.jsx` presents external publications and newly indexed activity without treating either as global popularity.

3. **Newest sorting only compared years.** `backend/services/searchSessionManager.js`, `sortRecords`, now compares publication days within the same year and puts records with unknown days after dated records. Frozen search-session pages retain their existing behavior.

4. **Loading replaced results.** The catalog loading branch in `frontend/src/App.jsx` hid cards with a spinner and cleared them after network errors. Existing cards are now retained during refresh and failure. Initial loading uses `PaperSkeletons.jsx`; Radar also supports incremental Load more pagination, refresh status, retry and source-sync status.

5. **arXiv claimed an unsupplied license.** `backend/services/providers/arxiv.js` assigned the same perpetual license to every paper and inferred peer review from a journal reference. It now leaves unsupplied licenses unknown and labels the retrieved arXiv version as a preprint. Journal-reference metadata may still supply a venue; it is not an acceptance decision.

6. **Alerts only scanned local theses.** `backend/services/topicAlertService.js` queried `Thesis` and scanned previous notifications. It now also invokes `discoveryAlerts.js`, with a separate external watermark and timestamp/ID continuation. A unique notification deduplication key prevents repeated external notifications for the same user, alert and indexed paper, including concurrent retries. Venue follows reuse the existing membership quota and deletion UI. Local notification behavior is retained.

7. **CORS accepted every Vercel subdomain.** Both `backend/server.js` and `backend/socket.js` contained a blanket `.vercel.app` exception. HTTP and socket CORS now require explicitly configured origins, alongside the retained local-development origins. Enumerate approved preview URLs instead of relying on that exception.

8. **DNS was forced to public resolvers.** `backend/server.js` overrode system DNS at startup and on SRV failure. Overrides now require an explicit `DNS_SERVERS` configuration. The API CSP no longer includes `unsafe-eval`. The CSP is an API response header; a deployment-specific frontend CSP still needs validation with Google OAuth, fonts, sockets and publisher PDF frames before enforcement at the hosting layer.

9. **Accessible suggestions and motion handling needed coverage.** Radar has debounced topic/venue suggestions with combobox/listbox semantics, Arrow keys, Enter and Escape. Native labeled selects, active filter chips, global focus outlines, reduced-motion styles and a 390-pixel browser regression cover the new flow. Existing title/author autocomplete remains available in Find papers.

## Implementation stages

The upgrade proceeded through a baseline audit and regression check, venue/date normalization, a separate indexed feed and provider jobs, Radar integration with existing paper actions, external alerts and security fixes, then component and browser verification. No wholesale rewrite of the large App or publication modal was attempted; the new feed UI, suggestions and skeletons are separate components.

## Discovery sources and evidence

- **CVPR, ICCV and WACV:** official CVF proceedings listings and per-paper citation metadata, plus separately scheduled DBLP jobs. CVPR 2026 is included by the current-year default.
- **ECCV:** DBLP proceedings metadata, including the 2026 edition. The adapter validates the record venue; it does not invent an official ECCV paper URL.
- **ICLR and NeurIPS:** OpenReview API 2 notes whose `content.venueid` exactly equals the accepted conference group, with independent DBLP jobs. Submission/revision timestamps are not publication dates. Rejected, withdrawn and deleted notes are excluded.
- **JMLR:** the official annual volume and per-paper citation metadata. JCLR, TMLR and PMLR are not aliases of JMLR.
- **arXiv:** the existing adapter with `cat:cs.CV`, submitted-date sorting and a bounded 90-day crawl. These remain preprints even if a journal reference exists.

Venue identification rejects workshops and Findings editions when a main conference is selected. Acceptance labels come from explicit official metadata. DBLP's review labels are identified as provider metadata; DBLP does not establish an acceptance decision. Missing dates, licenses, code or datasets remain unknown. HTTPS code/dataset links must be present in source metadata; “source linked” does not verify repository quality, reproducibility or dataset licensing.

Identifiers include normalized DOI, version-free arXiv ID, source identifier and a conservative normalized-title/first-author key. Repeated ingestion enriches the same indexed record and retains alternate source/version links. Official publication evidence takes precedence over a preprint. Title matching remains heuristic; different spellings can prevent a merge, and rare cases where new metadata bridges two already-indexed records can require manual reconciliation.

The feed uses publication-date and first-seen indexes, a text index, filter-bound cursor pagination, an initial snapshot cutoff and 60-second bounded process caching. New records added after the cutoff do not enter subsequent pages. Existing metadata corrections can still change publication-date ordering during browsing; this is not a transactionally frozen result snapshot.

Official source references: [OpenReview note retrieval](https://docs.openreview.net/how-to-guides/data-retrieval-and-modification/how-to-get-all-notes-for-submissions-reviews-rebuttals-etc), [CVPR 2026 repository](https://openaccess.thecvf.com/CVPR2026), [JMLR volume 27](https://www.jmlr.org/papers/v27/).

## Ingestion and configuration

Ingestion is off by default and there is no browser-triggered ingestion endpoint. Approved members can read the feed; public discovery access was not added. Existing save, compare, read, citation, report and summary actions reuse the existing routes and entitlements. The AI analysis button retains evidence grounding, speculative thesis-direction labels, opt-in behavior and summary/full-text quotas.

Set configuration through the server's normal secret manager or operator environment. Do not commit credentials.

- `RADAR_INGESTION_ENABLED`: `true` enables the server timer; default is disabled. The first automatic run occurs after one interval.
- `RADAR_INTERVAL_MINUTES`: default 60, bounded to 5–1440.
- `RADAR_YEARS`: default current UTC year and preceding year, for example `2026,2025`; at most three supported years. ICCV uses odd-year editions and ECCV uses even-year editions.
- `RADAR_BATCH_SIZE`: default 10 records per job, bounded to 1–30.
- `RADAR_JOBS_PER_RUN`: default 3, bounded to 1–20. Least recently attempted jobs run first.
- `DNS_SERVERS`: optional comma-separated IP addresses; unset preserves system DNS.
- `CLIENT_ORIGIN` / `FRONTEND_URL`: include every approved deployed or preview origin explicitly, including any Vercel preview that needs access.

Each job has a database lease, saved offset, last-attempt timestamp and last-success timestamp. Failed batches retain the offset and replay successful upserts safely. Official metadata downloads have a timeout and byte bound, one retry for server errors, cooldown on 429, no redirects, a fixed host allowlist and bounded caching. Conference listings permit up to 16 MiB; individual metadata responses permit up to 4 MiB. CVF/JMLR detail fetches are serial with a 350 ms pause. Jobs pause one second between batches. Transient network exceptions are retried on a later scheduled run rather than within the same download.

The backend adds `cheerio`; frontend test dependencies add Vitest, jsdom, Testing Library and Playwright. Clean installs use the lockfiles and install Windows-native optional dependencies on this host. Automated fixtures do not require provider credentials or a database.

## Index preparation and migration

New collections are `DiscoveryPaper` and `DiscoverySync`; no local Thesis documents are migrated. Topic alerts gain optional `venueId`, `externalCheckedAt` and `externalCheckedId`. Notifications gain an optional `dedupeKey` with a sparse unique index. Existing users and notifications do not need a content backfill.

Before enabling ingestion on an operator-approved staging database:

```text
node backend/scripts/prepareDiscoveryIndexes.js
node backend/scripts/syncDiscovery.js
```

Supply `MONGODB_URI` explicitly to that operator session. These maintenance scripts deliberately do not load `.env` files, print credentials or guess a database. Index preparation adds declared indexes without dropping existing indexes. Neither command was run against a database in this task.

## Verification results

- `backend: npm test`: 32 deterministic suites passed, including all original 31 suites and the new Radar suite. New cases cover venue identification, edition selection, date precision, newest ordering, session identity, alternate versions, acceptance labels, sanitization, upsert replay, cursor validation/pagination, provider failure, external notification replay and authentication/pending/banned access.
- `frontend: npm test`: 4 component tests passed. They cover independent filters/actions, preserved refresh results, pagination/reset/follows and debounced keyboard suggestions.
- `frontend: npm run test:e2e`: 2 Edge browser tests passed against synthetic API fixtures. They cover navigation, filters, save, compare, read modal, failed refresh preservation, keyboard venue selection, mobile width and dark theme. Fixture preview uses a separate environment directory and intercepts API calls; it does not access real backend data.
- `frontend: npm run lint`: passed with repository warnings; no errors. Hook/style warnings remain, including new Radar effect state updates.
- `frontend: npm run build`: passed, including the offline app-shell build. Existing large Excel-library chunk and FeedbackModal mixed-import warnings remain.
- Final clean dependency installs reported zero known vulnerabilities for both lockfiles. This is the package manager's audit result, not a security guarantee.

Read-only live checks retrieved one normalized official CVPR 2026 paper and one official JMLR 2026 paper. Both supplied year-level dates. OpenReview returned HTTP 403 even outside the sandbox. OpenReview parsing and acceptance filtering are fixture-tested; live OpenReview coverage remains unverified. DBLP, ECCV, NeurIPS and arXiv ingestion were not live-tested in this task.

Screenshots contain explicitly synthetic publications: [desktop and failed refresh](screenshots/radar-desktop.png), [mobile dark theme](screenshots/radar-mobile-dark.png).

## Files added and modified in this upgrade

Added backend files:

- `models/DiscoveryPaper.js`, `models/DiscoverySync.js`
- `services/venueCatalog.js`, `services/discoveryRecord.js`, `services/discoveryHttp.js`, `services/discoveryFeed.js`, `services/discoveryAlerts.js`
- `services/providers/discoveryOfficial.js`
- `scripts/prepareDiscoveryIndexes.js`, `scripts/syncDiscovery.js`
- `tests/discoveryRadar.test.js`

Modified backend files:

- `models/User.js`, `models/Notification.js`
- `routes/research.js` (already present as untracked work), `routes/user.js`
- `services/queryParser.js`, `services/scholarlyRecord.js`, `services/searchSessionManager.js`, `services/topicAlertService.js`
- `services/providers/arxiv.js`, `services/providers/dblp.js`
- `server.js`, `socket.js`, `tests/runAll.js`, `package.json`, `package-lock.json`

Added frontend files:

- `src/components/ResearchRadar.jsx`, `src/components/ResearchSuggestionInput.jsx`, `src/components/PaperSkeletons.jsx`, `src/utils/venues.js`
- `tests/setup.js`, `tests/radar.test.jsx`, `e2e/radar.spec.js`
- `vitest.config.js`, `playwright.config.js`, `vite.radar-test.config.js`

Modified frontend files:

- `src/App.jsx`, `src/components/Header.jsx`, `src/components/DiscoveryFiltersPanel.jsx`, `src/components/PublicationDetailModal.jsx`, `src/components/TopicAlertsModal.jsx`
- `src/utils/urlState.js`, `src/index.css`, `package.json`, `package-lock.json`

Also changed `.gitignore`, appended Radar documentation to `README.md`, and added this handoff plus screenshots under `docs/`. Other changes listed by Git were already present before this upgrade.

## Remaining limits and rollout checklist

1. Review the mixed working tree and prepare focused commits without including secrets or unrelated unfinished work. No commit or push was made automatically.
2. Prepare indexes on a staging MongoDB instance, run a small ingestion batch and inspect actual source status/venue counts. Database index creation, real MongoDB concurrency and multi-process ingestion/alerts have not been exercised here.
3. Investigate OpenReview's HTTP 403 from the deployment network, respecting source access rules; do not bypass it. Check current official venue groups and permissions before enabling its jobs.
4. Verify DBLP queries and ECCV coverage with live records, then check the official NeurIPS/ICLR acceptance group and recent arXiv coverage. Offset-based provider crawls can lag or miss records when source lists change; the feed is a bounded indexed sample, not a complete proceedings mirror.
5. Choose a polling budget appropriate to provider terms and server size. The default ingests only 30 records per run across three jobs; backfilling thousands of papers requires many runs. Process caches are not shared; deployments with many workers need shared cache/budget monitoring before making capacity claims.
6. Check year-only conference records under This year or Newly indexed activity. They cannot honestly appear as publications from the last seven days. The Edition selector can browse the preceding edition within the annual view.
7. Verify account-specific saves, membership quota boundaries, notification volume, PDF embedding and real AI-provider evidence on staging. Browser fixtures validate the UI contract, not live payments or paid AI calls.
8. Validate a frontend CSP with the actual deployment origins and PDF providers. Preserve server-side API limits and exact CORS origins. Public read-only Radar access requires a separate decision; existing privacy protections remain.
9. Enable ingestion only after those checks, monitor `lastSuccessAt` and unavailable jobs, and keep the prior deployment available for rollback. Rollback can disable `RADAR_INGESTION_ENABLED` immediately; retain indexed records and optional fields rather than deleting them automatically.
