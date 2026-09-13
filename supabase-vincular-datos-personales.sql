-- Vincular los datos personales de cada usuario a su cuenta real de
-- Supabase Auth (auth.uid()), no solo al campo de texto libre `name`.
--
-- POR QUÉ: supabase-enable-rls.sql ya exige estar logueado para tocar estas
-- tablas, pero como todo se identifica por `name` (texto que el propio
-- cliente envía), un usuario ya logueado podría, llamando directamente a la
-- API de Supabase en vez de usar la interfaz, leer o modificar el progreso
-- guardado de OTRA persona (su racha, su historial de fallos, sus
-- favoritas, su progreso de flashcards). Esto añade una columna `user_id`
-- ligada a la cuenta real y cambia las políticas para exigir que
-- coincida con quien ha iniciado sesión.
--
-- REQUISITO: ejecuta esto DESPUÉS de supabase-enable-rls.sql (sustituye
-- algunas de sus políticas por otras más estrictas).
--
-- QUÉ NO TOCA: `preguntas`/`flashcards` (contenido compartido, ya
-- correctamente admin-gated), `ranking` (marcador compartido) y
-- `duelos`/`duelo_respuestas` (estado compartido entre DOS jugadores —
-- restringir eso a un solo user_id no encaja bien y necesitaría columnas
-- separadas por jugador; se deja fuera de este ajuste). `rachas` mantiene
-- su lectura abierta a todo el mundo (para el Ranking y Logros de otros),
-- solo se restringe quién puede insertar/actualizar SU PROPIA fila.

-- ============ rachas ============
alter table rachas add column if not exists user_id uuid references auth.users(id) default auth.uid();

update rachas r set user_id = u.id
from auth.users u
where r.user_id is null
  and (
    lower(u.raw_user_meta_data->>'username') = lower(r.name)
    or (r.name = 'Pablo' and lower(u.raw_user_meta_data->>'username') = 'pabloadmin')
  );

drop policy if exists "rachas_insert_auth" on rachas;
drop policy if exists "rachas_update_auth" on rachas;

create policy "rachas_insert_propio" on rachas
  for insert to authenticated with check (auth.uid() = user_id);

create policy "rachas_update_propio" on rachas
  for update to authenticated using (auth.uid() = user_id);

-- ============ fallos ============
alter table fallos add column if not exists user_id uuid references auth.users(id) default auth.uid();

update fallos f set user_id = u.id
from auth.users u
where f.user_id is null
  and (
    lower(u.raw_user_meta_data->>'username') = lower(f.name)
    or (f.name = 'Pablo' and lower(u.raw_user_meta_data->>'username') = 'pabloadmin')
  );

drop policy if exists "fallos_select_auth" on fallos;
drop policy if exists "fallos_insert_auth" on fallos;
drop policy if exists "fallos_update_auth" on fallos;

create policy "fallos_select_propio" on fallos
  for select to authenticated using (auth.uid() = user_id);

create policy "fallos_insert_propio" on fallos
  for insert to authenticated with check (auth.uid() = user_id);

create policy "fallos_update_propio" on fallos
  for update to authenticated using (auth.uid() = user_id);

-- ============ favoritos ============
alter table favoritos add column if not exists user_id uuid references auth.users(id) default auth.uid();

update favoritos fv set user_id = u.id
from auth.users u
where fv.user_id is null
  and (
    lower(u.raw_user_meta_data->>'username') = lower(fv.name)
    or (fv.name = 'Pablo' and lower(u.raw_user_meta_data->>'username') = 'pabloadmin')
  );

drop policy if exists "favoritos_select_auth" on favoritos;
drop policy if exists "favoritos_insert_auth" on favoritos;
drop policy if exists "favoritos_delete_auth" on favoritos;

create policy "favoritos_select_propio" on favoritos
  for select to authenticated using (auth.uid() = user_id);

create policy "favoritos_insert_propio" on favoritos
  for insert to authenticated with check (auth.uid() = user_id);

create policy "favoritos_delete_propio" on favoritos
  for delete to authenticated using (auth.uid() = user_id);

-- ============ flashcards_progreso ============
alter table flashcards_progreso add column if not exists user_id uuid references auth.users(id) default auth.uid();

update flashcards_progreso fp set user_id = u.id
from auth.users u
where fp.user_id is null
  and (
    lower(u.raw_user_meta_data->>'username') = lower(fp.name)
    or (fp.name = 'Pablo' and lower(u.raw_user_meta_data->>'username') = 'pabloadmin')
  );

drop policy if exists "flashcards_progreso_select_auth" on flashcards_progreso;
drop policy if exists "flashcards_progreso_insert_auth" on flashcards_progreso;
drop policy if exists "flashcards_progreso_update_auth" on flashcards_progreso;

create policy "flashcards_progreso_select_propio" on flashcards_progreso
  for select to authenticated using (auth.uid() = user_id);

create policy "flashcards_progreso_insert_propio" on flashcards_progreso
  for insert to authenticated with check (auth.uid() = user_id);

create policy "flashcards_progreso_update_propio" on flashcards_progreso
  for update to authenticated using (auth.uid() = user_id);

-- ============ Comprobación tras ejecutar ============
-- Si alguna de estas consultas devuelve filas, significa que ese `name` no
-- se pudo emparejar con ninguna cuenta real (typo, cuenta borrada, etc.) —
-- esas filas quedan "huérfanas" y a partir de ahora nadie podrá leerlas ni
-- tocarlas (fallan cerradas, no abiertas), pero es mejor revisarlas:
select 'rachas' as tabla, name, racha_actual::text as col3, racha_record::text as col4 from rachas where user_id is null
union all
select 'fallos', name, veces::text, null::text from fallos where user_id is null
union all
select 'favoritos', name, pregunta_id::text, null::text from favoritos where user_id is null
union all
select 'flashcards_progreso', name, flashcard_id::text, null::text from flashcards_progreso where user_id is null;
