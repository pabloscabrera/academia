-- Registro de cada repaso de flashcard, para poder dibujar la retención.
--
-- `flashcards_progreso` guarda UNA fila por tarjeta con su estado actual: sirve
-- para saber cómo está cada tarjeta hoy, pero no deja rastro de la historia, y
-- sin historia no hay curva. Esta tabla añade una fila por repaso.
--
-- Solo se escribe y se lee: no se edita ni se borra, de ahí que no haya
-- políticas de update ni de delete. Si se borra la cuenta, se van con ella
-- (on delete cascade), igual que el resto de datos personales.
--
-- OJO: esto empieza a contar desde que lo ejecutes. Los repasos anteriores no
-- se pueden recuperar porque nunca se guardaron. La curva arranca vacía y se
-- va llenando.

create table if not exists public.flashcards_repasos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  flashcard_id uuid not null,
  -- 0 = Muy difícil, 3 = Difícil, 4 = Fácil, 5 = Muy fácil.
  calidad smallint not null,
  -- Se guarda calculado en vez de deducirlo al leer: si algún día cambia el
  -- umbral del algoritmo, lo ya registrado sigue significando lo que significaba.
  acierto boolean not null,
  -- Días que llevabas sin ver esa tarjeta cuando la repasaste. Es lo que
  -- permite responder "¿aguanto bien a tres semanas o se me olvida?".
  intervalo_antes integer not null default 0,
  creado_en timestamptz not null default now()
);

-- La consulta real es siempre "lo mío, de los últimos N días".
create index if not exists flashcards_repasos_usuario_fecha_idx
  on public.flashcards_repasos (user_id, creado_en desc);

alter table public.flashcards_repasos enable row level security;

drop policy if exists "flashcards_repasos_select_propio" on public.flashcards_repasos;
create policy "flashcards_repasos_select_propio" on public.flashcards_repasos
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "flashcards_repasos_insert_propio" on public.flashcards_repasos;
create policy "flashcards_repasos_insert_propio" on public.flashcards_repasos
  for insert to authenticated with check (auth.uid() = user_id);

-- Comprobación: debe devolver 2 filas, las dos con auth.uid() = user_id.
select policyname, cmd, qual::text as condicion, with_check::text as condicion_escritura
from pg_policies
where schemaname = 'public' and tablename = 'flashcards_repasos'
order by cmd;
