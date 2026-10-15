-- ============================================================================
-- ARREGLAR LAS ESCRITURAS QUE FALLABAN (favoritos, mazos, copiar un mazo)
--
-- Ejecutar UNA VEZ en Supabase → SQL Editor → New query → Run.
--
-- Se puede ejecutar aunque parte de esto ya estuviera hecho: no borra datos,
-- no duplica nada y se puede repetir sin miedo. Está escrito así a propósito,
-- porque en este proyecto ya pasó que una migración guardada en el repositorio
-- nunca había llegado a la base de datos — y no había forma de saberlo.
--
-- Cubre los tres síntomas reportados:
--   1. La estrella de "guardar pregunta" no hacía nada  -> favoritos
--   2. Poner/quitar color a un mazo se quedaba colgado  -> mazos_estilo
--   3. Copiar un mazo a otro                            -> flashcards.grupo_id
--
-- AL TERMINAR salen tres tablas de comprobación. Pégalas en el chat: dicen si
-- quedó algo fuera.
-- ============================================================================


-- ---------------------------------------------------------------- 1. FAVORITOS
-- La estrella inserta una fila aquí. Si falta la columna `user_id` o la
-- política de insert, el servidor la rechaza (código 42501) y antes eso se
-- perdía en silencio: la estrella simplemente no se ponía amarilla.

alter table public.favoritos
  add column if not exists user_id uuid references auth.users(id) default auth.uid();

-- Las favoritas de antes de que existiera `user_id` quedarían invisibles,
-- porque la política de lectura exige que sean tuyas. Se les pone dueño
-- cruzando el nombre con el usuario registrado.
update public.favoritos fv set user_id = u.id
from auth.users u
where fv.user_id is null
  and (
    lower(u.raw_user_meta_data->>'username') = lower(fv.name)
    or (fv.name = 'Pablo' and lower(u.raw_user_meta_data->>'username') = 'pabloadmin')
  );

alter table public.favoritos enable row level security;

drop policy if exists "favoritos_select_propio" on public.favoritos;
create policy "favoritos_select_propio" on public.favoritos
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "favoritos_insert_propio" on public.favoritos;
create policy "favoritos_insert_propio" on public.favoritos
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "favoritos_delete_propio" on public.favoritos;
create policy "favoritos_delete_propio" on public.favoritos
  for delete to authenticated using (auth.uid() = user_id);


-- ------------------------------------------------------------- 2. MAZOS_ESTILO
-- El color y el icono de cada mazo. Si la tabla no existe, guardar o quitar el
-- color falla. Hace falta una tabla aparte porque un mazo no es una entidad:
-- `mazo` es solo una etiqueta de texto repetida en cada tarjeta.

create table if not exists public.mazos_estilo (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mazo text not null,
  icono text,
  color text,
  primary key (user_id, mazo)
);

alter table public.mazos_estilo enable row level security;

drop policy if exists "mazos_estilo_select_propio" on public.mazos_estilo;
create policy "mazos_estilo_select_propio" on public.mazos_estilo
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "mazos_estilo_insert_propio" on public.mazos_estilo;
create policy "mazos_estilo_insert_propio" on public.mazos_estilo
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "mazos_estilo_update_propio" on public.mazos_estilo;
create policy "mazos_estilo_update_propio" on public.mazos_estilo
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "mazos_estilo_delete_propio" on public.mazos_estilo;
create policy "mazos_estilo_delete_propio" on public.mazos_estilo
  for delete to authenticated using (auth.uid() = user_id);


-- ------------------------------------------------- 3. COPIAR UN MAZO (grupo_id)
-- Copiar un mazo a otro crea tarjetas nuevas que comparten el repaso con las
-- originales. Eso se consigue con `grupo_id`: el progreso va indexado por
-- `grupo_id || id`, así que dos copias con el mismo grupo leen y escriben la
-- MISMA fila de progreso.

alter table public.flashcards add column if not exists grupo_id uuid;
update public.flashcards set grupo_id = id where grupo_id is null;
alter table public.flashcards alter column grupo_id set not null;
alter table public.flashcards alter column grupo_id set default gen_random_uuid();

-- `flashcards_progreso.flashcard_id` apuntaba a `flashcards(id)` con una clave
-- foránea. No puede seguir haciéndolo: ahora guarda un `grupo_id`, que se
-- repite entre las copias y por tanto no es una fila concreta. Se busca por
-- catálogo y no por nombre, porque un `drop constraint if exists <nombre>` no
-- avisa de nada si la restricción se llama de otra forma — se quedaría ahí y
-- seguiría bloqueando.
do $$
declare r record;
begin
  for r in
    select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'flashcards_progreso'
       and c.contype = 'f'
       -- `attname` es de tipo `name`, no `text`: sin el cast esto revienta con
       -- "operator does not exist: name[] = text[]" y, dentro de una sola
       -- transacción como la del editor de Supabase, se lleva por delante
       -- TODO lo anterior.
       and (select array_agg(a.attname::text)
              from unnest(c.conkey) k
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)
           = array['flashcard_id']::text[]
  loop
    execute format('alter table public.flashcards_progreso drop constraint %I', r.conname);
  end loop;
end $$;

-- Y lo mismo para `flashcards`: sin la política de insert no se pueden crear
-- mazos nuevos ni copiar los que hay.
alter table public.flashcards enable row level security;

drop policy if exists "flashcards_select_propio" on public.flashcards;
create policy "flashcards_select_propio" on public.flashcards
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "flashcards_insert_propio" on public.flashcards;
create policy "flashcards_insert_propio" on public.flashcards
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "flashcards_update_propio" on public.flashcards;
create policy "flashcards_update_propio" on public.flashcards
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "flashcards_delete_propio" on public.flashcards;
create policy "flashcards_delete_propio" on public.flashcards
  for delete to authenticated using (auth.uid() = user_id);


-- ============================ COMPROBACIONES ================================
-- Pega estas tres tablas en el chat.

-- (a) Las columnas de las que depende todo lo de arriba. Las tres "existe"
--     tienen que salir en true.
select c.tabla, c.columna,
       exists (select 1 from information_schema.columns i
                where i.table_schema = 'public' and i.table_name = c.tabla
                  and i.column_name = c.columna) as existe
from (values ('favoritos','user_id'), ('flashcards','user_id'),
             ('flashcards','grupo_id'), ('mazos_estilo','user_id')) as c(tabla, columna)
order by existe, c.tabla, c.columna;

-- (b) Filas sin dueño. Lo que salga aquí con un número distinto de 0 es algo
--     que existe pero que no te deja ver tu propia política de lectura.
select 'favoritos' as tabla, count(*) as sin_dueno from public.favoritos where user_id is null
union all
select 'flashcards', count(*) from public.flashcards where user_id is null;

-- (c) Las políticas que han quedado. Lo que hay que mirar: que cada tabla
--     tenga insert, select, update y delete, y que NINGUNA tenga `qual = true`
--     — una política permisiva de más deja tus tarjetas a la vista de todos,
--     porque Postgres suma (OR) las permisivas en vez de restarlas. Ya pasó.
select tablename as tabla, policyname as politica, cmd as operacion,
       qual as condicion_lectura, with_check as condicion_escritura
from pg_policies
where schemaname = 'public'
  and tablename in ('favoritos','flashcards','mazos_estilo','flashcards_progreso')
order by tablename, cmd, policyname;
