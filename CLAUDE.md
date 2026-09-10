# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — production build
- `npm run preview` — preview a production build locally

There is no lint or test setup in this repo (no test framework, no ESLint config).

## Architecture

This is a small single-page React app ("Ruta PIR" / academia-pir), built with Vite, backed by Supabase.

- Entry chain: `index.html` → `src/main.jsx` → `src/App.jsx`. `src/App.jsx` is the entire application (~2000 lines): all components, view logic, and Supabase calls live in this one file, organized as several feature components rendered by a top-level `AcademiaPIR` component based on a `section` state variable (tab navigation).
- Sections/tabs (`section` state, set via the nav in `AcademiaPIR`): `perfil` (stats, level/badges bar, fail history, favorites), `simulacros` (self-test quizzes), `banco` (question bank — "Reales" curated + "Inventadas por IA" AI-generated, open to all users with a daily quota, save-to-bank admin-only), `duelo` (1v1 duel/battle mode), `ranking` (leaderboard + streaks). There is no `temario` tab anymore — `TEMARIO` (static data in `src/temario.js`) is still imported and used internally to ground AI question generation (`GenerarPreguntasIA`), just not shown as a readable tab.
- Auth is real: Supabase Auth (email+password), using a synthesized fake email `username@ruta-pir.local` since Supabase Auth requires an email-shaped identifier — see `emailDeUsuario`/`usuarioFromSession`/`handleLogin`/`handleSignup` in `App.jsx`. Supabase's Auth dashboard must have "Confirm email" disabled for the Email provider (no real inbox exists for the fake domain, so signup must grant a session immediately). Admin access is still gated by a hardcoded username check against `ADMIN_NAME` ("pabloadmin") — whoever registers that exact username becomes admin and is displayed/stored everywhere as `name: "Pablo"`.
- Backend is Supabase (`src/supabaseClient.js`), used directly from `App.jsx` via `supabase.from(...)` calls, and from `api/generar-preguntas.js` (a separate server-side client, same anon key) to enforce the daily AI-question quota. Tables in use: `preguntas` (questions), `ranking`, `rachas` (streaks + daily-progress + badge totals), `duelos`/`duelo_respuestas` (duel state/answers), `fallos` (per-user per-question fail counts), `favoritos` (per-user saved questions), `ia_uso` (per-user per-day AI generation quota). There is no schema/migrations folder in this repo — the schema lives only in Supabase itself; one-off `supabase-*.sql` files at the repo root are migrations already handed to and run by the user, kept only as a record.
- UI preferences (font-size "zoom" scale and page background color, set from the gear icon in the header) are per-device, persisted to `localStorage` under `pir-ajustes` — not synced through Supabase.

### Things to be aware of

- `Src/Main.jsx` (capital `S`) is a stray duplicate of `src/main.jsx`. The actual entry point used by `index.html` is `src/main.jsx` (lowercase); `Src/` is not referenced anywhere and is effectively dead.
- `academia-pir.tsx` at the repo root is an earlier standalone prototype of the app (with its own seeded question data) and is not imported or built — treat it as a legacy reference, not live code.
- `src/supabaseClient.js` has the Supabase URL and anon key hardcoded inline rather than read from environment variables.
