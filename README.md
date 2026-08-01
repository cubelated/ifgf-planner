# IFGF Planner

Indonesian-first volunteer scheduling web app for IFGF church teams. The current version is a functional frontend prototype with a Supabase-ready authentication boundary and realistic demo data.

## Current features

- Responsive coordinator dashboard
- Draft schedule board with staffing gaps
- Recurring event-group setup and live date preview
- Volunteer eligibility and event-group overview
- Mobile-oriented “cannot serve” date reporting
- Draft LINE Official Account notification flow
- Supabase email magic-link login when configured
- Demo mode when Supabase is not configured
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
4. Run `npm run dev`.

Without environment variables, the app opens in demo mode and all data remains in memory.

## Environment variables

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Only use the Supabase publishable key in the browser. Never expose a secret or service-role key.

## Production work still required

- Create the Supabase schema and organization-scoped RLS policies
- Persist event groups, occurrences, volunteer eligibility, unavailability, and assignments
- Add coordinator invitations and LINE Login
- Implement the deterministic scheduling engine and locked assignments
- Connect LINE Messaging API webhooks and delivery logs
- Add English and Traditional Chinese dictionaries
- Add end-to-end and accessibility tests

The UI intentionally keeps generated schedules in a draft state until a coordinator publishes them.
