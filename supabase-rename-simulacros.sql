-- Ejecutar una sola vez en Supabase (Dashboard → SQL Editor → New query → Run).
-- Renombra el campo "curso" de las preguntas de "Simulacro N" a "PIR YY".
-- Usa una expresión regular (con límite de dígito) para no confundir
-- "Simulacro 1" con "Simulacro 10", "Simulacro 11", etc., y para que dé
-- igual si está escrito "Simulacro 1", "Simulacro 01" o con un sufijo como
-- "Simulacro 01 (AMIR)".

update public.preguntas set curso = 'PIR 25' where curso ~* '^simulacro\s*0?1([^0-9]|$)';
update public.preguntas set curso = 'PIR 24' where curso ~* '^simulacro\s*0?2([^0-9]|$)';
update public.preguntas set curso = 'PIR 23' where curso ~* '^simulacro\s*0?3([^0-9]|$)';
update public.preguntas set curso = 'PIR 22' where curso ~* '^simulacro\s*0?4([^0-9]|$)';
update public.preguntas set curso = 'PIR 21' where curso ~* '^simulacro\s*0?5([^0-9]|$)';

-- Para comprobar el resultado (opcional, ejecutar aparte):
-- select distinct curso from public.preguntas order by curso;
