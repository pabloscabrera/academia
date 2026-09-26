-- `flashcards` seguía siendo visible para todo el mundo pese a tener sus
-- políticas de "solo lo mío".
--
-- Postgres SUMA las políticas permisivas: si una sola dice `true`, gana esa,
-- y da igual lo estrictas que sean las demás. En `flashcards` convivían
-- `flashcards_select` (SELECT, `true`) y `flashcards_insert` con las
-- `*_propio` creadas por supabase-flashcards-privadas.sql, así que cualquiera
-- con cuenta veía las tarjetas de los demás.
--
-- Por qué no las quitó aquella migración: sus `drop policy if exists` usan
-- los nombres que creó supabase-enable-rls.sql (`flashcards_select_auth`,
-- `flashcards_update_admin`). Estas dos tenían otro nombre — se crearon
-- aparte, probablemente desde el panel de Supabase — así que el drop no las
-- encontró y el `if exists` se lo tragó sin avisar.
--
-- Lección para futuras migraciones de RLS: después de crear políticas,
-- LISTAR las que quedan (la consulta del final) en vez de dar por hecho que
-- un drop por nombre limpió lo anterior.

drop policy if exists "flashcards_select" on flashcards;
drop policy if exists "flashcards_insert" on flashcards;

-- Comprobación de esta tabla: deben quedar 4 filas, todas `*_propio`.
select policyname, cmd, qual::text as condicion
from pg_policies
where schemaname = 'public' and tablename = 'flashcards'
order by cmd, policyname;

-- Revisión del resto de tablas personales: busca cualquier fila con `true`
-- donde debería poner `auth.uid() = user_id`. `rachas` no está en la lista
-- a propósito: su lectura es abierta por diseño, porque Ranking y Logros
-- muestran las rachas de todo el mundo.
select tablename, policyname, cmd,
       qual::text as condicion,
       with_check::text as condicion_escritura
from pg_policies
where schemaname = 'public'
  and tablename in ('fallos', 'favoritos', 'flashcards_progreso', 'preguntas_progreso')
order by tablename, cmd, policyname;
