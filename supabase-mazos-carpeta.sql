-- Carpetas de mazos: UNA etiqueta de texto por mazo, nada más.
--
-- Por qué así y no como el intento anterior (que se mandó quitar): aquí no hay
-- mazos dentro de mazos, ni tarjetas en varios sitios, ni nada que mover. Un
-- mazo tiene, como mucho, el nombre de una carpeta escrito al lado. La carpeta
-- NO es una entidad: existe mientras algún mazo la nombre y desaparece sola
-- cuando el último deja de hacerlo, así que no puede haber carpetas vacías ni
-- huérfanas que limpiar.
--
-- Va en `mazos_estilo` porque esa tabla ya es exactamente "los ajustes de un
-- mazo" (una fila por usuario y mazo, con su icono y su color) y ya se pide en
-- el arranque: añadir la carpeta ahí no cuesta ni una consulta más.
--
-- Idempotente y seguro de ejecutar dos veces. Crea la tabla entera si no
-- existiera, porque un fichero en el repositorio NO es prueba de que la
-- migración llegara a la base — lección ya aprendida aquí.

create table if not exists public.mazos_estilo (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mazo    text not null,
  icono   text,
  color   text,
  primary key (user_id, mazo)
);

alter table public.mazos_estilo add column if not exists carpeta text;

alter table public.mazos_estilo enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mazos_estilo' and policyname = 'mazos_estilo_select_propio') then
    create policy "mazos_estilo_select_propio" on public.mazos_estilo for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mazos_estilo' and policyname = 'mazos_estilo_insert_propio') then
    create policy "mazos_estilo_insert_propio" on public.mazos_estilo for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mazos_estilo' and policyname = 'mazos_estilo_update_propio') then
    create policy "mazos_estilo_update_propio" on public.mazos_estilo for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  -- Un delete SIN política no falla: borra 0 filas en silencio. Ya pasó con
  -- `flashcards_progreso`, así que esta va explícita.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mazos_estilo' and policyname = 'mazos_estilo_delete_propio') then
    create policy "mazos_estilo_delete_propio" on public.mazos_estilo for delete using (auth.uid() = user_id);
  end if;
end $$;

-- Sin esto, PostgREST (la capa REST de Supabase) sigue unos segundos con el
-- esquema de antes en memoria y rechaza las escrituras con un
-- "Could not find the 'carpeta' column ... in the schema cache" aunque la
-- columna ya exista. Pasó de verdad.
notify pgrst, 'reload schema';

-- Comprobación para pegar en el chat: tiene que salir la columna `carpeta` y
-- cuatro políticas (select, insert, update, delete).
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'mazos_estilo' order by ordinal_position;
select policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'mazos_estilo' order by policyname;
