-- Borrar un usuario desde Authentication → Users daba error de clave ajena.
--
-- `supabase-vincular-datos-personales.sql` y `supabase-flashcards-privadas.sql`
-- añadieron `user_id uuid references auth.users(id)` sin decir qué hacer al
-- borrar el usuario referenciado. Sin `on delete cascade`, Postgres aplica
-- NO ACTION: en cuanto alguien tiene una fila de rachas (se crea sola al
-- entrar en la app), su cuenta ya no se puede borrar.
--
-- Esto rehace esas claves ajenas con `on delete cascade`, así que borrar la
-- cuenta se lleva por delante sus rachas, fallos, favoritos, flashcards y
-- progreso. Que es lo que se espera de "borrar el usuario".
--
-- Se buscan las restricciones por catálogo en vez de por nombre: si alguna
-- se llamara distinto, un `drop constraint if exists` con el nombre esperado
-- no la encontraría, y la nueva convivíría con la vieja dejando el bloqueo
-- exactamente igual que estaba.

do $$
declare
  tabla text;
  fk record;
begin
  foreach tabla in array array[
    'rachas', 'fallos', 'favoritos',
    'flashcards', 'flashcards_progreso', 'preguntas_progreso'
  ]
  loop
    for fk in
      select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
      where ns.nspname = 'public'
        and rel.relname = tabla
        and con.contype = 'f'
        and con.confrelid = 'auth.users'::regclass
    loop
      execute format('alter table public.%I drop constraint %I', tabla, fk.conname);
    end loop;

    execute format(
      'alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete cascade',
      tabla, tabla || '_user_id_fkey'
    );
  end loop;
end $$;

-- Comprobación: las 6 filas deben salir con borrado = 'c' (cascade).
select rel.relname as tabla, con.conname as restriccion, con.confdeltype as borrado
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace ns on ns.oid = rel.relnamespace
where ns.nspname = 'public'
  and con.contype = 'f'
  and con.confrelid = 'auth.users'::regclass
order by 1;
