# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — production build
- `npm run preview` — preview a production build locally

There is no lint or test setup in this repo (no test framework, no ESLint config).

## Architecture

This is a small single-page React app ("Ruta PIR" / academia-pir), built with Vite, backed by Supabase.

- Entry chain: `index.html` → `src/main.jsx` → `src/App.jsx`. `src/App.jsx` is the entire application (~1100 lines): all components, view logic, and Supabase calls live in this one file, organized as several feature components rendered by a top-level `AcademiaPIR` component based on a `section` state variable (tab navigation).
- Sections/tabs (`section` state, set via the nav in `AcademiaPIR`): `simulacros` (self-test quizzes), `banco` (question bank, admin-only), `temario` (syllabus, static `TEMARIO` data at the top of `App.jsx`), `duelo` (1v1 duel/battle mode), `ranking` (leaderboard + streaks).
- Admin access is gated by a hardcoded username check against `ADMIN_NAME` ("pabloadmin") near the top of `App.jsx`, not a real auth role.
- Backend is Supabase (`src/supabaseClient.js`), used directly from `App.jsx` via `supabase.from(...)` calls. Tables in use: `preguntas` (questions), `ranking`, `rachas` (streaks), `duelos` and `duelo_respuestas` (duel state/answers). There is no schema/migrations folder in this repo — the schema lives only in Supabase itself.
- User identity/session and some local-only data are persisted to `localStorage` via the `loadPersonal`/`savePersonal` helpers in `App.jsx`, not Supabase — there is no real auth system, just a stored display name.

### Things to be aware of

- `Src/Main.jsx` (capital `S`) is a stray duplicate of `src/main.jsx`. The actual entry point used by `index.html` is `src/main.jsx` (lowercase); `Src/` is not referenced anywhere and is effectively dead.
- `academia-pir.tsx` at the repo root is an earlier standalone prototype of the app (with its own seeded question data) and is not imported or built — treat it as a legacy reference, not live code.
- `src/supabaseClient.js` has the Supabase URL and anon key hardcoded inline rather than read from environment variables.
