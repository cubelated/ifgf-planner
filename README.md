# IFGF Planner

Indonesian-first volunteer scheduling web app for IFGF church teams. Application records are stored in Supabase and isolated by organization with Row Level Security (RLS).

## Current features

- Responsive coordinator and volunteer views
- Live dashboard metrics derived from persisted records
- Recurring event setup with persisted future occurrences
- Service sections, volunteer eligibility, and event-group membership management
- Schedule assignments validated against eligibility, event membership, status, and availability
- Shareable monthly unavailability forms with name autocomplete and date selection
- Month-filtered coordinator reports with assignment-conflict counts
- Draft/published schedule versions
- Event-scoped LINE Official Account group connections
- Scheduled unavailability-form announcements with an expiry-day reminder
- Schedule-image export and LINE group broadcast
- Configurable volunteer reminders (24 hours before by default)
- Supabase email/password sign-in for existing accounts
- Account creation is temporarily disabled in the login UI
- In-session password changes with current-password verification and no email confirmation
- Indonesian localization foundation for future English and Traditional Chinese support

## Stack

- Next.js / React / TypeScript
- Vinext and Vite for Cloudflare-compatible output
- Supabase JavaScript client
- Lucide icons
- Tailwind CSS entry point plus product-specific CSS

## Local setup

Requirements: Node.js 22.13 or newer.

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env`.
3. Add a Supabase project URL and publishable key.
4. For a new Supabase project, link the Supabase CLI and run `supabase db push`.
5. Deploy the public form endpoint with `supabase functions deploy unavailability-form`.
   The checked-in `supabase/config.toml` disables gateway JWT verification for this function because the random request token is its credential.
6. Configure `LINE_CHANNEL_SECRET` and `LINE_CHANNEL_ACCESS_TOKEN` as Supabase secrets.
7. Deploy `line-webhook`, `create-line-connection-code`, `send-line-reminders`, and
   `broadcast-line-schedule`. Keep JWT verification enabled for every function except
   `line-webhook`, which verifies the LINE signature itself.
8. Run `npm run dev`.

Without environment variables, the app displays a configuration-required screen. It never falls back to fake data.

## Environment variables

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Only use the Supabase publishable key in the browser. Never expose a secret or service-role key.

## Database security

- Every public table has RLS enabled.
- Owner and coordinator mutations are restricted to their organization.
- Volunteers can report only their own unavailability.
- Assignment triggers reject inactive, unqualified, unavailable, out-of-group, or cross-organization assignments.
- Monthly form links store only a SHA-256 token hash, expire on a coordinator-selected date, and can be rotated without deleting existing responses.
- New share links keep the request token in the URL fragment so it is not included in ordinary page requests; older query-string links remain compatible.
- Anonymous browsers cannot call the privileged form RPCs directly; a token-validating Edge Function is the only public entry point.
- The browser uses only the Supabase publishable key; never expose a secret or service-role key.

## Next implementation stages

- Add coordinator invitations and LINE Login
- Implement the deterministic draft scheduling engine and locked assignments
- Add LINE delivery-history and retry management screens
- Add English and Traditional Chinese dictionaries
- Add end-to-end and accessibility tests

The UI intentionally keeps generated schedules in a draft state until a coordinator publishes them.

## Storage retention and efficient reads

- All schedules, assignments, unavailability responses, form requests, and schedule-share links remain in Postgres. Historical months load on demand.
- The planner initially loads the current and next month. A session cache retains at most six months, including those two months. Assignment edits refresh the affected month and metadata; reference data is reused for up to 60 seconds.
- `get_planner_month` and `get_planner_metadata` run with the caller's permissions and existing RLS. Month boundaries use the organization's timezone. JSON aggregation avoids the REST row limit for monthly assignments. The unread count covers all visible history, including unloaded months.
- Daily at **03:05 Asia/Taipei**, completed cron executions older than 30 days are pruned in batches of 5,000.
- Daily at **03:15 Asia/Taipei**, the housekeeping dispatcher checks for exported LINE images older than 30 days. It invokes `planner-maintenance` only when expired objects exist. Actual deletion uses the Storage API, at most 1,000 objects per call; failures or remaining batches retry on the next daily check.
- On the first day of each Taiwan calendar month, housekeeping also removes connection codes expired for over 30 days and terminal message/broadcast records older than 90 days, in bounded batches. Retryable/in-progress deliveries and active form broadcasts are retained.
- The minute-level LINE dispatcher invokes the reminder worker only for due work. A monthly schedule is considered published when a coordinator has created a share link for that event/month. No legacy `schedule_version_id` column is required.
- Completed broadcasts retain a 90-day operational history. Message retry keys remain stable; already accepted LINE retries are reconciled rather than resent. Retries stop before LINE's 24-hour retry-key expiration.

Deploy the `planner_*` optimization migrations before deploying `send-line-reminders` and `planner-maintenance`. Existing installations need Vault entries `line_reminder_project_url` and `line_reminder_publishable_key`; retention creates a random `planner_maintenance_token` in Vault. The credential validator is executable only by `service_role`. Never put its value in browser code or Git. Both worker endpoints require the Vault credential in the request body in addition to gateway verification. The existing `line_reminder_publishable_key` entry must contain the legacy anon JWT used for gateway authorization; it is sent in both `apikey` and `Authorization` headers.

`tests/planner-database.test.mjs` runs the optimization migrations and actual PostgreSQL/RLS queries in an isolated PGlite database. Its fixture contains schema and permissions, with no production records or credentials. It does not replay older deployment-history migrations, some of which were edited after their original deployment.
