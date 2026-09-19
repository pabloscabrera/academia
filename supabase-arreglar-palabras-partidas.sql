-- Segunda tanda de artefactos de transcripción, en la dirección contraria a
-- supabase-arreglar-fragmentos-y-palabras-pegadas.sql: aquí una palabra real
-- quedó partida en dos por un espacio de más al extraer el texto del PDF
-- (ej. "evalua ción" en vez de "evaluación"), en vez de dos palabras
-- pegadas en una.
--
-- Encontrados revisando las ~2102 preguntas (export cacheado de la revisión
-- anterior en esta misma sesión, jsonb_agg vía Supabase): cada palabra
-- adyacente separada por un único espacio se concatenó y se comprobó con
-- hunspell (diccionario es_ES) — solo se trata como partida si (a) la
-- concatenación es una palabra real según hunspell Y (b) al menos una de las
-- dos mitades NO es una palabra válida por sí sola (para descartar casos
-- como "Coping Cat es un tratamiento" o "post hoc es que", donde "Cat"/"hoc"
-- son parte de un nombre propio/término y "es" es el verbo, no un
-- fragmento). De ~52.600 pares de palabras adyacentes candidatos, esto dejó
-- solo 4 casos reales (aparte del ya corregido en
-- supabase-arreglar-dirigido-pir22.sql).
--
-- Acotados siempre por id exacto. Dos de los cuatro caen en la misma
-- pregunta (PIR 22, Pregunta 127): una en el enunciado, otra en una opción —
-- confirmado además por las opciones hermanas de la pregunta de PIR 21, que
-- sí usan correctamente "respuesta operante" en otras dos ocasiones.

-- PIR 22 · pregunta · 'evalua ción psicológica' -> 'evaluación psicológica'
update preguntas
set pregunta = replace(pregunta, 'evalua ción psicológica', 'evaluación psicológica')
where id = 'd63803af-6271-4ab0-830f-ba1b3be4b2f1';

-- PIR 22 · pregunta + opcion_1 · 'informa ción' -> 'información' y
-- 'pre viamente' -> 'previamente'
update preguntas
set pregunta = replace(pregunta, 'informa ción observacionales', 'información observacionales'),
    opciones = (
      select jsonb_agg(
        to_jsonb(replace(elem, 'pre viamente establecidos', 'previamente establecidos'))
        order by ord
      )
      from jsonb_array_elements_text(opciones::jsonb) with ordinality as t(elem, ord)
    )
where id = '7935861d-c7ad-4b75-b561-8f0e452cd6de';

-- PIR 21 · opcion_1 · 'respuesta o perante' -> 'respuesta operante'
update preguntas
set opciones = (
  select jsonb_agg(
    to_jsonb(replace(elem, 'respuesta o perante', 'respuesta operante'))
    order by ord
  )
  from jsonb_array_elements_text(opciones::jsonb) with ordinality as t(elem, ord)
)
where id = 'edb021c3-eb95-401a-bc4d-3bbf6598a995';

-- Comprobación: debería devolver las 3 filas ya corregidas.
select id, curso, tema, pregunta, opciones
from preguntas
where id in (
  'd63803af-6271-4ab0-830f-ba1b3be4b2f1',
  '7935861d-c7ad-4b75-b561-8f0e452cd6de',
  'edb021c3-eb95-401a-bc4d-3bbf6598a995'
)
order by curso, id;
