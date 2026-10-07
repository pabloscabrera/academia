-- Un color y un icono por mazo, para distinguirlos de un vistazo en la lista.
--
-- Hace falta una tabla aparte porque **un mazo no es una entidad**: `mazo` es
-- solo una etiqueta de texto repetida en cada fila de `flashcards`, y la lista
-- de mazos sale de agrupar las tarjetas. Guardar el estilo en `flashcards`
-- obligaría a escribirlo en todas las tarjetas del mazo y a resolver qué pasa
-- cuando no coinciden entre sí.
--
-- La clave es (user_id, mazo): el estilo es de cada cual, igual que las
-- tarjetas. Es puramente decorativo, así que todas las columnas admiten nulo y
-- la app se las apaña sin fila: un mazo sin estilo se ve como se veía antes.
--
-- Pueden quedar filas huérfanas (un mazo cuyo nombre ya no usa ninguna
-- tarjeta). No molestan: nada las lee si el mazo no existe, y si algún día
-- vuelve a crearse un mazo con ese nombre, recupera su color. Aun así, la app
-- borra la fila al eliminar un mazo.

create table if not exists public.mazos_estilo (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mazo text not null,
  icono text,
  color text,
  primary key (user_id, mazo)
);

alter table public.mazos_estilo enable row level security;

-- Igual que `flashcards`: privado por completo, nadie ve el de nadie.
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

-- Comprobación: debe listar las cuatro políticas de arriba y ninguna más.
-- Una política de más con `qual = true` dejaría el estilo a la vista de todos
-- (ya pasó con `flashcards`, ver supabase-limpiar-politicas-duplicadas.sql).
select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'mazos_estilo'
 order by policyname;
