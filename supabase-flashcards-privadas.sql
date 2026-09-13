-- Hacer las flashcards privadas por usuario: cada persona añade y ve solo
-- las suyas, nadie ve las de otra persona.
--
-- QUÉ HACE:
-- 1) Añade user_id a `flashcards` (igual que ya se hizo con rachas/fallos/
--    favoritos/flashcards_progreso en supabase-vincular-datos-personales.sql).
-- 2) Asigna las 271 tarjetas ya existentes (el mazo "Porcentajes/
--    prevalencias" que subiste tú desde Anki) a TU cuenta, ya que las
--    subiste tú — a partir de ahora son tu mazo privado, nadie más las ve.
-- 3) Sustituye las políticas de RLS de `flashcards` (antes: lectura
--    abierta a todo el mundo, escritura solo admin) por unas que exigen
--    auth.uid() = user_id en TODO (leer, crear, editar, borrar) — cada
--    persona solo puede tocar sus propias tarjetas.
--
-- REQUISITO: ejecuta esto después de supabase-enable-rls.sql. No hace
-- falta haber ejecutado supabase-vincular-datos-personales.sql antes,
-- son independientes (aquella no tocaba `flashcards`).

alter table flashcards add column if not exists user_id uuid references auth.users(id) default auth.uid();

update flashcards f set user_id = u.id
from auth.users u
where f.user_id is null
  and lower(u.raw_user_meta_data->>'username') = 'pabloadmin';

drop policy if exists "flashcards_select_auth" on flashcards;
drop policy if exists "flashcards_update_admin" on flashcards;

create policy "flashcards_select_propio" on flashcards
  for select to authenticated using (auth.uid() = user_id);

create policy "flashcards_insert_propio" on flashcards
  for insert to authenticated with check (auth.uid() = user_id);

create policy "flashcards_update_propio" on flashcards
  for update to authenticated using (auth.uid() = user_id);

create policy "flashcards_delete_propio" on flashcards
  for delete to authenticated using (auth.uid() = user_id);

-- Comprobación: debería devolver 0 filas (todas las 271 ya asignadas a ti).
select count(*) as huerfanas from flashcards where user_id is null;
