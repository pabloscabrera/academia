-- Ejecutar una sola vez en Supabase (Dashboard → SQL Editor → New query → Run).
-- Prepara todo lo necesario para "Mi perfil": racha de días, total de
-- preguntas respondidas/acertadas (para las insignias), historial de fallos
-- por pregunta, favoritos, y el límite diario de preguntas personalizadas
-- generadas por IA.

-- 1) Ampliar la tabla `rachas` con los datos de racha de días y progreso total.
alter table public.rachas
  add column if not exists total_correctas integer not null default 0,
  add column if not exists total_respondidas integer not null default 0,
  add column if not exists correctas_hoy integer not null default 0,
  add column if not exists fecha_correctas_hoy date,
  add column if not exists racha_dias_actual integer not null default 0,
  add column if not exists racha_dias_record integer not null default 0,
  add column if not exists ultimo_dia_racha date;

-- 2) Historial de fallos: cuántas veces ha fallado cada persona cada pregunta.
create table if not exists public.fallos (
  name text not null,
  pregunta_id uuid not null references public.preguntas(id) on delete cascade,
  veces integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (name, pregunta_id)
);

alter table public.fallos enable row level security;
drop policy if exists "fallos_select" on public.fallos;
create policy "fallos_select" on public.fallos for select using (true);
drop policy if exists "fallos_insert" on public.fallos;
create policy "fallos_insert" on public.fallos for insert with check (true);
drop policy if exists "fallos_update" on public.fallos;
create policy "fallos_update" on public.fallos for update using (true) with check (true);

-- 3) Favoritos: preguntas que cada persona ha marcado para guardarlas en su perfil.
create table if not exists public.favoritos (
  name text not null,
  pregunta_id uuid not null references public.preguntas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (name, pregunta_id)
);

alter table public.favoritos enable row level security;
drop policy if exists "favoritos_select" on public.favoritos;
create policy "favoritos_select" on public.favoritos for select using (true);
drop policy if exists "favoritos_insert" on public.favoritos;
create policy "favoritos_insert" on public.favoritos for insert with check (true);
drop policy if exists "favoritos_delete" on public.favoritos;
create policy "favoritos_delete" on public.favoritos for delete using (true);

-- 4) Uso diario de la IA (preguntas personalizadas), para aplicar el límite
--    diario por persona sin agotar la cuota gratuita de Gemini.
create table if not exists public.ia_uso (
  name text not null,
  fecha date not null,
  cantidad integer not null default 0,
  primary key (name, fecha)
);

alter table public.ia_uso enable row level security;
drop policy if exists "ia_uso_select" on public.ia_uso;
create policy "ia_uso_select" on public.ia_uso for select using (true);
drop policy if exists "ia_uso_insert" on public.ia_uso;
create policy "ia_uso_insert" on public.ia_uso for insert with check (true);
drop policy if exists "ia_uso_update" on public.ia_uso;
create policy "ia_uso_update" on public.ia_uso for update using (true) with check (true);
