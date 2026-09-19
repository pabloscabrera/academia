-- Ejecutar una sola vez en Supabase (Dashboard → SQL Editor → New query → Run).
--
-- Nueva tabla para saber, pregunta a pregunta, cuántas veces la has
-- respondido (en Autoevaluaciones o en Duelo) y si alguna vez la acertaste —
-- lo que alimenta el icono de ojo + número en cada tarjeta del Banco de
-- preguntas y el contador "hechas / total" de la pestaña Reales, además de
-- la nueva pestaña "Pendientes" (preguntas con veces = 0).
--
-- Mismo patrón que `fallos`/`favoritos` (ver supabase-perfil.sql y
-- supabase-vincular-datos-personales.sql), pero creada ya directamente con
-- `user_id` y las políticas de auth.uid() = user_id, sin el paso intermedio
-- de RLS abierta que tuvieron aquellas tablas cuando RLS aún no existía.

create table if not exists public.preguntas_progreso (
  name text not null,
  pregunta_id uuid not null references public.preguntas(id) on delete cascade,
  user_id uuid references auth.users(id) default auth.uid(),
  veces integer not null default 0,
  acertada boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (name, pregunta_id)
);

alter table public.preguntas_progreso enable row level security;

drop policy if exists "preguntas_progreso_select_propio" on public.preguntas_progreso;
create policy "preguntas_progreso_select_propio" on public.preguntas_progreso
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "preguntas_progreso_insert_propio" on public.preguntas_progreso;
create policy "preguntas_progreso_insert_propio" on public.preguntas_progreso
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "preguntas_progreso_update_propio" on public.preguntas_progreso;
create policy "preguntas_progreso_update_propio" on public.preguntas_progreso
  for update to authenticated using (auth.uid() = user_id);
