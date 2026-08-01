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
- Draft LINE Official Account notification flow
- Supabase email magic-link login when configured
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
2. Copy `.env.example` to `.env.local`.
3. Add a Supabase project URL and publishable key.
4. For a new Supabase project, link the Supabase CLI and run `supabase db push`.
5. Deploy the public form endpoint with `supabase functions deploy unavailability-form`.
   The checked-in `supabase/config.toml` disables gateway JWT verification for this function because the random request token is its credential.
6. Run `npm run dev`.

Without environment variables, the app displays a configuration-required screen. It never falls back to fake data.

## Environment variables

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
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
- Connect LINE Messaging API webhooks and delivery logs
- Add English and Traditional Chinese dictionaries
- Add end-to-end and accessibility tests

The UI intentionally keeps generated schedules in a draft state until a coordinator publishes them.
