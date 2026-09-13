-- Ejecutar una sola vez en Supabase (Dashboard → SQL Editor → New query → Run).
-- Añade lo necesario para la ruleta diaria y la liga semanal.

alter table public.rachas
  add column if not exists ultimo_giro_ruleta date,
  add column if not exists correctas_semana integer not null default 0,
  add column if not exists semana_actual date;
