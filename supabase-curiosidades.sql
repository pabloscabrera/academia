-- Ejecutar una sola vez en Supabase (Dashboard → SQL Editor → New query → Run).
-- Prepara la tabla de curiosidades generadas por IA (pestaña "Curiosidades")
-- y el registro de qué curiosidades ha visto ya cada persona.

create table if not exists public.curiosidades (
  id uuid primary key default gen_random_uuid(),
  curso text,
  tema text,
  texto text not null,
  pregunta_mini text,
  respuesta_mini text,
  created_at timestamptz not null default now()
);

alter table public.curiosidades enable row level security;
drop policy if exists "curiosidades_select" on public.curiosidades;
create policy "curiosidades_select" on public.curiosidades for select using (true);
drop policy if exists "curiosidades_insert" on public.curiosidades;
create policy "curiosidades_insert" on public.curiosidades for insert with check (true);

create table if not exists public.curiosidades_vistas (
  name text not null,
  curiosidad_id uuid not null references public.curiosidades(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (name, curiosidad_id)
);

alter table public.curiosidades_vistas enable row level security;
drop policy if exists "curiosidades_vistas_select" on public.curiosidades_vistas;
create policy "curiosidades_vistas_select" on public.curiosidades_vistas for select using (true);
drop policy if exists "curiosidades_vistas_insert" on public.curiosidades_vistas;
create policy "curiosidades_vistas_insert" on public.curiosidades_vistas for insert with check (true);
