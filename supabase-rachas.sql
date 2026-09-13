-- Ejecutar una sola vez en Supabase (Dashboard → SQL Editor → New query → Run).
-- Prepara la tabla `rachas` para guardar racha en vivo + récord histórico,
-- tanto de autoevaluaciones como de duelos, y permite que la app (con la
-- clave anon) pueda leerla y escribirla.

-- 1) Crea la tabla si no existe (con la app ya tenía código que la usaba,
--    pero la tabla nunca llegó a crearse en Supabase).
create table if not exists public.rachas (
  name text primary key,
  racha_actual integer not null default 0,
  racha_record integer not null default 0,
  racha_duelo_actual integer not null default 0,
  racha_duelos_record integer not null default 0
);

-- Y añade cualquier columna que falte por si la tabla ya existía a medias
-- (no borra ni toca las columnas que ya hubiera).
alter table public.rachas
  add column if not exists racha_actual integer not null default 0,
  add column if not exists racha_record integer not null default 0,
  add column if not exists racha_duelo_actual integer not null default 0,
  add column if not exists racha_duelos_record integer not null default 0;

-- 2) "name" único, para poder guardar/actualizar la fila de cada persona
do $$
begin
  alter table public.rachas add constraint rachas_name_key unique (name);
exception when others then null;
end $$;

-- 3) Permite leer y escribir la tabla (igual que el resto de tablas de la app)
alter table public.rachas enable row level security;

drop policy if exists "rachas_select" on public.rachas;
create policy "rachas_select" on public.rachas for select using (true);

drop policy if exists "rachas_insert" on public.rachas;
create policy "rachas_insert" on public.rachas for insert with check (true);

drop policy if exists "rachas_update" on public.rachas;
create policy "rachas_update" on public.rachas for update using (true) with check (true);

-- 4) Activa el tiempo real para que la racha "en vivo" se vea al instante
--    en la pantalla de Ranking de cualquier otra persona conectada.
do $$
begin
  alter publication supabase_realtime add table public.rachas;
exception when others then null;
end $$;
