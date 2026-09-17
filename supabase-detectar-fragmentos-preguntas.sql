-- Diagnóstico (no destructivo): busca un artefacto de transcripción de PDF
-- distinto al de supabase-detectar-basura-preguntas.sql/supabase-detectar-
-- finales-raros.sql (que solo miran el FINAL del texto) — aquí se trata de
-- basura pegada EN MEDIO de la frase, como en:
--   "un deseo intenso y persistente de tener Pá una discapacidad física..."
--   "...incomodidad persistente con, o de sentimientosnegativos intensos..."
-- ("Pá" es un fragmento suelto de la maquetación del PDF original —
-- probablemente un salto de página o un encabezado repetido — colado a
-- mitad de frase; "sentimientosnegativos" es "sentimientos negativos" sin
-- el espacio, perdido al extraer el texto del PDF).
--
-- Como estos artefactos pueden aparecer en cualquier punto del texto, no
-- solo al final, no hay un patrón fijo que se pueda limpiar en bloque de
-- forma segura: cada fila que devuelva esto hay que revisarla a mano y
-- corregir el texto exacto antes de hacer ningún update.

-- 1) Fragmento corto con mayúscula suelta a mitad de frase (rodeado de
--    palabras en minúscula), tipo "tener Pá una" — las siglas reales del
--    dominio (DSM, CIE, PIR, TAE, EMDR...) van en mayúsculas todas seguidas
--    y no caen en este patrón (que exige solo 1 mayúscula + 1-2 minúsculas).
select id, curso, tema, pregunta
from preguntas
where pregunta ~ '[a-záéíóúñ] [A-ZÁÉÍÓÚ][a-záéíóúñ]{1,2} [a-záéíóúñ]'
order by curso, id;

select id, curso, tema, pregunta, opciones
from preguntas
where exists (
  select 1 from jsonb_array_elements_text(opciones::jsonb) as opcion
  where opcion ~ '[a-záéíóúñ] [A-ZÁÉÍÓÚ][a-záéíóúñ]{1,2} [a-záéíóúñ]'
)
order by curso, id;

select id, curso, tema, explicacion
from preguntas
where explicacion ~ '[a-záéíóúñ] [A-ZÁÉÍÓÚ][a-záéíóúñ]{1,2} [a-záéíóúñ]'
order by curso, id;

-- 2) Palabras "pegadas" sin espacio (20+ letras seguidas), tipo
--    "sentimientosnegativos" — el español tiene palabras largas legítimas,
--    así que esto también hay que revisarlo caso por caso, no es prueba
--    definitiva de basura por sí solo.
select id, curso, tema, pregunta
from preguntas
where pregunta ~ '[a-záéíóúñA-ZÁÉÍÓÚÑ]{20,}'
order by curso, id;

select id, curso, tema, pregunta, opciones
from preguntas
where exists (
  select 1 from jsonb_array_elements_text(opciones::jsonb) as opcion
  where opcion ~ '[a-záéíóúñA-ZÁÉÍÓÚÑ]{20,}'
)
order by curso, id;

select id, curso, tema, explicacion
from preguntas
where explicacion ~ '[a-záéíóúñA-ZÁÉÍÓÚÑ]{20,}'
order by curso, id;
