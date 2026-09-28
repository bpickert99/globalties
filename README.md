# Global Ties KC — Program Tracker

A web app for running IVLP and other exchange programs at Global Ties KC: per-project checklists from the IVLP Programmer Guide with automatic due dates, a Google Tasks–style to-do list across all projects, participant rosters, schedules, email drafts, Word itinerary export, and a Monday Meeting summary.

- **Live site:** https://bpickert99.github.io/globalties/
- **Stack:** React + TypeScript (Vite), Supabase (Postgres + auth), hosted on GitHub Pages.

## How it fits together

| Area | Where |
| --- | --- |
| Database schema, access rules, IVLP checklist | `supabase/migrations/` |
| Due-date / applicability rules | `src/logic.ts` |
| Email templates (from the Programmer Guide) | `src/emails.ts` |
| Word itinerary layout | `src/itinerary.ts` |
| Pages | `src/pages/`, project tabs in `src/project/` |

Access is limited to emails in the `members` table (row level security). To give a colleague access, they create an account on the site and their email is added:

```sql
insert into members (email) values ('colleague@globaltieskc.org');
```

## Development

```sh
npm install
npm run dev      # http://localhost:5173/globalties/
npm run build
npm run lint
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
