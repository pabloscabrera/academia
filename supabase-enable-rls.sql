-- Habilitar Row Level Security (RLS) en todas las tablas de la app.
--
-- POR QUÉ: la clave "anon" de Supabase está hardcodeada en el bundle JS que
-- se sirve al navegador (src/supabaseClient.js) y también la usa
-- api/generar-preguntas.js. Sin RLS, esa clave por sí sola permite leer,
-- escribir y borrar CUALQUIER fila de CUALQUIER tabla directamente contra la
-- API REST de Supabase, sin haberse registrado ni iniciado sesión nunca —
-- cualquiera que inspeccione el JS del sitio tiene acceso completo a la
-- base de datos. Este script exige que exista una sesión real (login) para
-- tocar la base de datos, salvo en `ia_uso`, que se explica más abajo.
--
-- LO QUE ESTO NO ARREGLA: ninguna tabla tiene una columna que vincule cada
-- fila con el usuario que la creó (auth.uid()) — todo se identifica por
-- `name`, un texto libre que el propio cliente envía. Así que un usuario ya
-- logueado podría, llamando directamente a la API REST (no desde la
-- interfaz), leer o modificar filas de `rachas`, `fallos`, `favoritos`, etc.
-- de otro usuario. Cerrar eso del todo requeriría añadir una columna
-- user_id ligada a auth.uid() en cada tabla y reescribir políticas y
-- consultas — un cambio de esquema mayor, no necesario ahora mismo para un
-- grupo pequeño y de confianza. Este script cierra la puerta grande (acceso
-- anónimo total), que es la que de verdad importa para compartir la app.
--
-- REQUISITO EN EL CÓDIGO: antes de ejecutar esto, la rama debe llevar ya el
-- commit que recarga preguntas/ranking/rachas/flashcards en cuanto se
-- concede una sesión (login o registro) — si no, cualquiera que inicie
-- sesión por primera vez en un navegador nuevo vería el banco, el ranking y
-- las flashcards vacíos hasta refrescar la página, porque esa carga inicial
-- ocurre una vez al montar la app, antes de tener sesión.
--
-- El email de administrador de abajo sale de ADMIN_NAME ("pabloadmin") +
-- DOMINIO_CUENTAS ("ruta-pir.local") en src/App.jsx. Revísalo si alguno de
-- los dos cambia.

-- ============ preguntas ============
alter table preguntas enable row level security;

create policy "preguntas_select_auth" on preguntas
  for select to authenticated using (true);

create policy "preguntas_insert_admin" on preguntas
  for insert to authenticated with check (auth.email() = 'pabloadmin@ruta-pir.local');

create policy "preguntas_update_admin" on preguntas
  for update to authenticated using (auth.email() = 'pabloadmin@ruta-pir.local');

create policy "preguntas_delete_admin" on preguntas
  for delete to authenticated using (auth.email() = 'pabloadmin@ruta-pir.local');

-- ============ ranking ============
alter table ranking enable row level security;

create policy "ranking_select_auth" on ranking
  for select to authenticated using (true);

create policy "ranking_insert_auth" on ranking
  for insert to authenticated with check (true);

-- ============ rachas ============
alter table rachas enable row level security;

create policy "rachas_select_auth" on rachas
  for select to authenticated using (true);

create policy "rachas_insert_auth" on rachas
  for insert to authenticated with check (true);

create policy "rachas_update_auth" on rachas
  for update to authenticated using (true);

-- ============ duelos ============
alter table duelos enable row level security;

create policy "duelos_select_auth" on duelos
  for select to authenticated using (true);

create policy "duelos_insert_auth" on duelos
  for insert to authenticated with check (true);

create policy "duelos_update_auth" on duelos
  for update to authenticated using (true);

create policy "duelos_delete_auth" on duelos
  for delete to authenticated using (true);

-- ============ duelo_respuestas ============
alter table duelo_respuestas enable row level security;

create policy "duelo_respuestas_select_auth" on duelo_respuestas
  for select to authenticated using (true);

create policy "duelo_respuestas_insert_auth" on duelo_respuestas
  for insert to authenticated with check (true);

-- ============ fallos ============
alter table fallos enable row level security;

create policy "fallos_select_auth" on fallos
  for select to authenticated using (true);

create policy "fallos_insert_auth" on fallos
  for insert to authenticated with check (true);

create policy "fallos_update_auth" on fallos
  for update to authenticated using (true);

-- ============ favoritos ============
alter table favoritos enable row level security;

create policy "favoritos_select_auth" on favoritos
  for select to authenticated using (true);

create policy "favoritos_insert_auth" on favoritos
  for insert to authenticated with check (true);

create policy "favoritos_delete_auth" on favoritos
  for delete to authenticated using (true);

-- ============ flashcards ============
alter table flashcards enable row level security;

create policy "flashcards_select_auth" on flashcards
  for select to authenticated using (true);

create policy "flashcards_update_admin" on flashcards
  for update to authenticated using (auth.email() = 'pabloadmin@ruta-pir.local');

-- ============ flashcards_progreso ============
alter table flashcards_progreso enable row level security;

create policy "flashcards_progreso_select_auth" on flashcards_progreso
  for select to authenticated using (true);

create policy "flashcards_progreso_insert_auth" on flashcards_progreso
  for insert to authenticated with check (true);

create policy "flashcards_progreso_update_auth" on flashcards_progreso
  for update to authenticated using (true);

-- ============ ia_uso ============
-- Esta tabla solo la usa api/generar-preguntas.js, un endpoint servidor que
-- crea su propio cliente de Supabase con la clave anon SIN reenviar la
-- sesión del usuario que hizo la petición HTTP — así que siempre actúa con
-- el rol "anon", nunca "authenticated". Si aquí se exigiera "authenticated"
-- se rompería la cuota diaria de preguntas por IA para todo el mundo. Se
-- deja accesible al rol anon (igual que hoy sin RLS), pero ya con RLS
-- activado por si en el futuro se añaden más políticas.
alter table ia_uso enable row level security;

create policy "ia_uso_select_anon" on ia_uso
  for select to anon using (true);

create policy "ia_uso_insert_anon" on ia_uso
  for insert to anon with check (true);

create policy "ia_uso_update_anon" on ia_uso
  for update to anon using (true);
