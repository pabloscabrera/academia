-- Diagnóstico (no destructivo), más amplio que supabase-detectar-basura-
-- preguntas.sql: en vez de buscar solo "punto + número", busca CUALQUIER
-- final raro. Las preguntas de esta app siempre terminan en ":" o "?", así
-- que cualquier `pregunta` que no termine así es sospechosa, sea cual sea
-- el motivo (letras sueltas tipo ".pa", números, comillas colgando, etc.).
-- Para las opciones, que no tienen una terminación fija esperada, se busca
-- cualquier cosa que acabe en un punto seguido de un resto corto de letras
-- o dígitos sueltos (no una palabra normal completa).

-- 1) Preguntas que no terminan en ":" ni "?"
select id, curso, tema, pregunta
from preguntas
where pregunta !~ '[:?]\s*$'
order by curso, id;

-- 2) Opciones que terminan en punto + un resto corto raro (letras y/o
--    números sueltos, de 1 a 6 caracteres) tras el punto final
select id, curso, tema, pregunta, opciones
from preguntas
where exists (
  select 1 from jsonb_array_elements_text(opciones::jsonb) as opcion
  where opcion ~ '\.\s*[a-zA-ZáéíóúñÁÉÍÓÚÑ0-9]{1,6}\s*$'
    and opcion !~ '\.\s*(un|una|el|la|los|las|de|en|no|sí)\s*$' -- evita falsos positivos de palabras cortas normales
)
order by curso, id;

-- 3) Explicaciones, mismo criterio amplio que las opciones
select id, curso, tema, explicacion
from preguntas
where explicacion ~ '\.\s*[a-zA-ZáéíóúñÁÉÍÓÚÑ0-9]{1,6}\s*$'
  and explicacion !~ '\.\s*(un|una|el|la|los|las|de|en|no|sí)\s*$'
order by curso, id;
