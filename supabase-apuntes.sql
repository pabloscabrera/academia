-- Apuntes de cada mazo: la imagen de la tabla o diapositiva de la que salen
-- sus tarjetas, para repasar mirando la fuente y no solo tarjeta a tarjeta.
--
-- Dos piezas:
--   1. Un bucket PRIVADO de Storage, `apuntes`, donde va cada imagen bajo la
--      carpeta de su dueño: <user_id>/<id>.jpg. Privado porque son diapositivas
--      de una academia: no se sirven por una URL pública, la app pide una
--      firmada que caduca.
--   2. Una tabla, `apuntes_mazo`, que dice a qué mazo pertenece cada imagen.
--      Hace falta porque un mazo no es una entidad (es el texto de
--      `flashcards.mazo`), igual que pasa con `mazos_estilo`: renombrar un mazo
--      es cambiar esta columna, no mover ficheros.
--
-- Idempotente: se puede ejecutar dos veces sin romper nada.

create table if not exists public.apuntes_mazo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mazo text not null,
  ruta text not null,
  created_at timestamptz not null default now()
);

create index if not exists apuntes_mazo_user_mazo on public.apuntes_mazo (user_id, mazo);

alter table public.apuntes_mazo enable row level security;

drop policy if exists "apuntes_mazo_select_propio" on public.apuntes_mazo;
drop policy if exists "apuntes_mazo_insert_propio" on public.apuntes_mazo;
drop policy if exists "apuntes_mazo_update_propio" on public.apuntes_mazo;
drop policy if exists "apuntes_mazo_delete_propio" on public.apuntes_mazo;

create policy "apuntes_mazo_select_propio" on public.apuntes_mazo
  for select to authenticated using (auth.uid() = user_id);
create policy "apuntes_mazo_insert_propio" on public.apuntes_mazo
  for insert to authenticated with check (auth.uid() = user_id);
create policy "apuntes_mazo_update_propio" on public.apuntes_mazo
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Sin esta, un delete no falla: borra 0 filas en silencio (ver CLAUDE.md).
create policy "apuntes_mazo_delete_propio" on public.apuntes_mazo
  for delete to authenticated using (auth.uid() = user_id);

-- El bucket. 10 MB por imagen de margen: la app las reduce antes de subirlas
-- (lado mayor de 2400 px, JPEG), así que una captura del iPad se queda en
-- unos cientos de KB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('apuntes', 'apuntes', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Cada uno solo ve, sube y borra lo de su carpeta (<user_id>/...).
drop policy if exists "apuntes_leer_propio" on storage.objects;
drop policy if exists "apuntes_subir_propio" on storage.objects;
drop policy if exists "apuntes_cambiar_propio" on storage.objects;
drop policy if exists "apuntes_borrar_propio" on storage.objects;

create policy "apuntes_leer_propio" on storage.objects
  for select to authenticated
  using (bucket_id = 'apuntes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "apuntes_subir_propio" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'apuntes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "apuntes_cambiar_propio" on storage.objects
  for update to authenticated
  using (bucket_id = 'apuntes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'apuntes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "apuntes_borrar_propio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'apuntes' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';

-- Comprobación (se mira el estado final, no el "Success"):
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'apuntes';
-- select policyname, cmd from pg_policies where tablename in ('apuntes_mazo', 'objects') and policyname like 'apuntes%' order by 1;
