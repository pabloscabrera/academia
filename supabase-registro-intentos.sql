-- Tope de intentos de registro por IP, para el alta con código de invitación
-- (api/registro.js). Ejecuta esto en el SQL editor de Supabase.
--
-- Solo la función del servidor escribe y lee aquí, y lo hace con la
-- service_role key, que se salta RLS por diseño. Por eso la tabla se queda
-- con RLS activado y SIN NINGUNA POLÍTICA: así la anon key que viaja en el
-- bundle del navegador no puede ni leerla ni borrarla para resetear el tope.

create table if not exists public.registro_intentos (
  id uuid primary key default gen_random_uuid(),
  ip text,
  usuario text,
  exito boolean not null default false,
  creado_en timestamptz not null default now()
);

create index if not exists registro_intentos_ip_idx
  on public.registro_intentos (ip, creado_en desc);

alter table public.registro_intentos enable row level security;

-- Comprobación: debe devolver rowsecurity = true y 0 políticas.
select relrowsecurity as rls_activado,
       (select count(*) from pg_policies where tablename = 'registro_intentos') as politicas
from pg_class where relname = 'registro_intentos';
