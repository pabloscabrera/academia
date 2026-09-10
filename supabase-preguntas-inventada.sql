-- Ejecutar una sola vez en Supabase (Dashboard → SQL Editor → New query → Run).
-- Añade la columna que distingue las preguntas reales (de examen) de las
-- inventadas por IA. Las preguntas que ya existen se quedan marcadas como
-- reales (false) automáticamente.

alter table public.preguntas
  add column if not exists inventada boolean not null default false;
