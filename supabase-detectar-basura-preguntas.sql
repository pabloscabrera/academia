-- Diagnóstico (no destructivo): busca preguntas/opciones cuyo texto termina
-- en un patrón sospechoso de "basura" pegada al final (ej. ". 48"), como el
-- que se ve en preguntas de PIR 25 tipo "...no sentirse sucio. . 48".
--
-- OJO: como estas preguntas son de "Porcentajes/prevalencias", un número al
-- final PUEDE ser un dato real (ej. "0.48") y no basura. Por eso esto es
-- solo una consulta de revisión — hay que mirar caso por caso antes de
-- decidir qué limpiar, no borrar en bloque.

-- 1) Preguntas cuyo texto termina en punto + número suelto
select id, curso, tema, pregunta
from preguntas
where pregunta ~ '\.\s*\.?\s*\d{1,4}\s*$'
order by curso, id;

-- 2) Opciones (dentro del array `opciones`) que terminan igual
select id, curso, tema, pregunta, opciones
from preguntas
where exists (
  select 1 from jsonb_array_elements_text(opciones::jsonb) as opcion
  where opcion ~ '\.\s*\.?\s*\d{1,4}\s*$'
)
order by curso, id;

-- 3) Por si acaso, lo mismo en la explicación
select id, curso, tema, explicacion
from preguntas
where explicacion ~ '\.\s*\.?\s*\d{1,4}\s*$'
order by curso, id;
