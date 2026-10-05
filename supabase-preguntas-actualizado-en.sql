-- Para que una corrección de texto llegue al móvil sin esperar 24 horas.
--
-- La app guarda el banco entero en el navegador (src/cachePreguntas.js) y,
-- para decidir si vuelve a descargarlo, compara el RECUENTO de preguntas: unos
-- bytes frente a los ~2 MB del banco. El recuento detecta altas y bajas, pero
-- un `update` de texto —como el de supabase-arreglar-numeros-sueltos.sql— no
-- cambia ningún número y es invisible. De ahí el tope de un día, que no
-- arreglaba el problema: solo acotaba cuánto podía durar.
--
-- Esta columna da el dato que faltaba. La app pide la fila más reciente
-- (una sola, unos 100 bytes) y, si la marca no coincide con la que guardó,
-- vuelve a descargar. Así una corrección por SQL se ve en la siguiente
-- apertura, y mientras no haya ninguna no se descarga nada.
--
-- El trigger es imprescindible: un `default now()` solo actúa al insertar, y
-- lo que hay que detectar son precisamente los updates.

alter table public.preguntas
  add column if not exists actualizado_en timestamptz not null default now();

create or replace function public.preguntas_marcar_actualizacion()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists preguntas_actualizado_en on public.preguntas;
create trigger preguntas_actualizado_en
  before update on public.preguntas
  for each row execute function public.preguntas_marcar_actualizacion();

-- La app pide `order by actualizado_en desc limit 1`, así que el índice evita
-- recorrer las 2102 filas en cada arranque.
create index if not exists preguntas_actualizado_en_idx
  on public.preguntas (actualizado_en desc);

-- Comprobación: la primera fila debe traer una fecha, y la segunda consulta
-- debe devolver una marca MÁS NUEVA que la de antes (el trigger funciona).
select count(*) as filas, max(actualizado_en) as ultima from public.preguntas;

update public.preguntas set tema = tema
 where id = (select id from public.preguntas order by actualizado_en asc limit 1);

select max(actualizado_en) as ultima_tras_el_update from public.preguntas;
