-- Políticas duplicadas y abiertas conviviendo con las de "solo lo mío".
--
-- Postgres SUMA las políticas permisivas: si una sola dice `true`, gana esa,
-- y da igual lo estrictas que sean las demás. En cinco tablas convivían las
-- `*_propio` (auth.uid() = user_id) con otras abiertas creadas aparte, así
-- que cualquiera con cuenta podía leer —y en varios casos modificar— los
-- datos personales de los demás llamando a la API directamente. Por la web
-- no se notaba: la interfaz solo pide lo propio.
--
-- Por qué no las quitaron sus migraciones: los `drop policy if exists` de
-- supabase-flashcards-privadas.sql y supabase-vincular-datos-personales.sql
-- usan los nombres que creó supabase-enable-rls.sql (`*_auth`). Estas tenían
-- otro nombre — se crearon aparte, probablemente desde el panel de Supabase —
-- así que el drop no las encontró y el `if exists` se lo tragó sin avisar.
--
-- Lección: después de crear políticas, LISTAR las que quedan (consulta del
-- final) en vez de dar por hecho que un drop por nombre limpió lo anterior.
--
-- ANTES DE EJECUTAR: comprueba que no hay filas sin dueño. Al cerrar el
-- acceso abierto, una fila con user_id nulo deja de ser visible hasta para
-- quien la creó. Cuando se hizo esto salió una sola, en `rachas`, resto de
-- una cuenta de prueba ya borrada (se borró con un delete aparte).
--
--   select 'fallos' as tabla, count(*) from fallos where user_id is null
--   union all select 'favoritos', count(*) from favoritos where user_id is null
--   union all select 'flashcards_progreso', count(*) from flashcards_progreso where user_id is null
--   union all select 'preguntas_progreso', count(*) from preguntas_progreso where user_id is null
--   union all select 'rachas', count(*) from rachas where user_id is null;

-- ============ flashcards ============
drop policy if exists "flashcards_select" on flashcards;
drop policy if exists "flashcards_insert" on flashcards;

-- ============ fallos ============
drop policy if exists "fallos_select" on fallos;
drop policy if exists "fallos_insert" on fallos;
drop policy if exists "fallos_update" on fallos;

-- ============ favoritos ============
drop policy if exists "favoritos_select" on favoritos;
drop policy if exists "favoritos_insert" on favoritos;
drop policy if exists "favoritos_delete" on favoritos;

-- ============ flashcards_progreso ============
drop policy if exists "flashcards_progreso_select" on flashcards_progreso;
drop policy if exists "flashcards_progreso_insert" on flashcards_progreso;
drop policy if exists "flashcards_progreso_update" on flashcards_progreso;

-- ============ rachas ============
-- Aquí solo se cierra la ESCRITURA. La lectura sigue abierta a propósito
-- (`rachas_select_auth`, que se conserva): Ranking y Logros muestran las
-- rachas de todo el mundo. `rachas_select` era un duplicado exacto de esa,
-- y además podía estar concedida a `public`, o sea también sin sesión.
--
-- Cerrar la escritura es seguro: registrarAcierto, registrarResultadoDuelo,
-- registrarProgresoDiario y girarRuleta en App.jsx escriben siempre con
-- `name: user.name`. Nadie toca la fila del rival, ni siquiera en duelo.
drop policy if exists "rachas_insert" on rachas;
drop policy if exists "rachas_update" on rachas;
drop policy if exists "rachas_select" on rachas;

-- `preguntas_progreso` no aparece: se creó ya con las políticas correctas
-- (supabase-preguntas-progreso.sql) y nunca tuvo duplicados.

-- Comprobación final: todo `*_propio`, salvo el `true` de lectura de rachas.
select tablename, policyname, cmd,
       qual::text as condicion,
       with_check::text as condicion_escritura
from pg_policies
where schemaname = 'public'
  and tablename in ('fallos', 'favoritos', 'flashcards', 'flashcards_progreso',
                    'preguntas_progreso', 'rachas')
order by tablename, cmd, policyname;
