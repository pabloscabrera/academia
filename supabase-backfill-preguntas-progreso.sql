-- Ejecutar una sola vez en Supabase (Dashboard → SQL Editor → New query → Run).
-- Requisito: haber ejecutado ya supabase-preguntas-progreso.sql.
--
-- Rellena preguntas_progreso con el historial de `fallos` que ya existía
-- antes de que preguntas_progreso existiera, para que esas preguntas al
-- menos salgan de la pestaña "Pendientes" del Banco (veces >= 1).
--
-- OJO — limitación real, no hay forma de evitarla: antes de esta función,
-- la app solo guardaba las preguntas que FALLABAS (tabla `fallos`); las que
-- acertabas a la primera nunca se registraban en ningún sitio. Este script
-- solo puede recuperar lo que hay constancia de haber fallado alguna vez —
-- las preguntas que acertaste a la primera antes de esta actualización
-- seguirán apareciendo en "Pendientes" hasta que las respondas de nuevo,
-- porque no existe ningún registro de ellas que se pueda recuperar.

insert into preguntas_progreso (name, pregunta_id, user_id, veces, acertada, updated_at)
select
  f.name,
  f.pregunta_id,
  u.id,
  f.veces,
  false,
  f.updated_at
from fallos f
join auth.users u
  on lower(u.raw_user_meta_data->>'username') = lower(f.name)
  or (f.name = 'Pablo' and lower(u.raw_user_meta_data->>'username') = 'pabloadmin')
on conflict (name, pregunta_id) do update
set veces = greatest(preguntas_progreso.veces, excluded.veces),
    user_id = excluded.user_id,
    updated_at = excluded.updated_at;

-- Comprobación: cuántas filas se han rellenado por persona.
select name, count(*) as preguntas_recuperadas
from preguntas_progreso
group by name
order by name;
