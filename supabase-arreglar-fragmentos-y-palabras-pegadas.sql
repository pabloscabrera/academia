-- Corrige artefactos de transcripción del PDF encontrados al revisar TODA
-- la tabla `preguntas` (2102 filas), no solo el caso puntual de PIR 25 ya
-- corregido en supabase-arreglar-pregunta-disforia-pir25.sql. Se generaron
-- exportando toda la tabla con jsonb_agg (para saltar el límite de 100 filas
-- del editor SQL de Supabase) y revisando a mano cada coincidencia de las dos
-- consultas de supabase-detectar-fragmentos-preguntas.sql, más una comprobación
-- con hunspell (diccionario es_ES) sobre toda palabra de 20+ letras seguidas
-- para separar palabras pegadas reales de términos compuestos legítimos
-- (electroencefalografía, contracondicionamiento, autoengrandecimiento... no
-- se tocan, son palabras españolas válidas de una sola pieza).
--
-- Dos tipos de artefacto, acotados siempre por id exacto:
--
-- 1) El fragmento suelto "Pá" (resto de maquetación del PDF, visto ya en la
--    pregunta de disforia de PIR 25) aparece en otras 8 filas más, repartidas
--    entre PIR 22, 23 y 24 — no era un caso aislado.
-- 2) Palabras que deberían llevar guion (términos compuestos habituales en el
--    manual: "cognitivo-perceptivos", "estabilidad-inestabilidad",
--    "individualismo-colectivismo", "despersonalización-desrealización",
--    "dialéctico-conductual"...) perdieron el guion al extraer el texto del
--    PDF y quedaron pegadas en una sola palabra; confirmado en varios casos
--    comparándolo con una opción hermana de la misma pregunta que sí usa el
--    guion correctamente (ej. PIR 24 "trastorno desafiante-oposicionista" en
--    una opción y "trastorno desafianteoposicionista" en otra de la misma
--    pregunta).

-- PIR 25 · opcion · 'cuidadores o Pá familiares' -> 'cuidadores o familiares'
update preguntas
set opciones = (
  select jsonb_agg(
    to_jsonb(replace(elem, 'cuidadores o Pá familiares', 'cuidadores o familiares'))
    order by ord
  )
  from jsonb_array_elements_text(opciones::jsonb) with ordinality as t(elem, ord)
)
where id = 'a575d31a-058e-4221-b2d0-a427790af9e0';

-- PIR 24 · opcion · 'cambios Pá fisiológicos' -> 'cambios fisiológicos'
update preguntas
set opciones = (
  select jsonb_agg(
    to_jsonb(replace(elem, 'cambios Pá fisiológicos', 'cambios fisiológicos'))
    order by ord
  )
  from jsonb_array_elements_text(opciones::jsonb) with ordinality as t(elem, ord)
)
where id = '710eed69-e424-40fa-a567-8536ef42652d';

-- PIR 24 · opcion · 'cómo Pá ayudar' -> 'cómo ayudar'
update preguntas
set opciones = (
  select jsonb_agg(
    to_jsonb(replace(elem, 'cómo Pá ayudar', 'cómo ayudar'))
    order by ord
  )
  from jsonb_array_elements_text(opciones::jsonb) with ordinality as t(elem, ord)
)
where id = 'f5ad118b-4483-4830-be9a-9593600e51e1';

-- PIR 23 · opcion · 'cumplir con Pá las expectativas' -> 'cumplir con las expectativas'
update preguntas
set opciones = (
  select jsonb_agg(
    to_jsonb(replace(elem, 'cumplir con Pá las expectativas', 'cumplir con las expectativas'))
    order by ord
  )
  from jsonb_array_elements_text(opciones::jsonb) with ordinality as t(elem, ord)
)
where id = '5f05c5ba-6308-4f42-bdf6-3a2fa68cfe99';

-- PIR 23 · opcion · 'desproporcionado a Pá la situación' -> 'desproporcionado a la situación'
update preguntas
set opciones = (
  select jsonb_agg(
    to_jsonb(replace(elem, 'desproporcionado a Pá la situación', 'desproporcionado a la situación'))
    order by ord
  )
  from jsonb_array_elements_text(opciones::jsonb) with ordinality as t(elem, ord)
)
where id = '878e8df6-f2f4-4078-92c2-ddad117d8d4d';

-- PIR 23 · opcion · 'en el que Pá existe' -> 'en el que existe'
update preguntas
set opciones = (
  select jsonb_agg(
    to_jsonb(replace(elem, 'en el que Pá existe', 'en el que existe'))
    order by ord
  )
  from jsonb_array_elements_text(opciones::jsonb) with ordinality as t(elem, ord)
)
where id = 'ac7fc9c2-ac7f-428c-a62f-52f9d499669a';

-- PIR 23 · opcion · 'una dieta Pá y/o cambios' -> 'una dieta y/o cambios'
update preguntas
set opciones = (
  select jsonb_agg(
    to_jsonb(replace(elem, 'una dieta Pá y/o cambios', 'una dieta y/o cambios'))
    order by ord
  )
  from jsonb_array_elements_text(opciones::jsonb) with ordinality as t(elem, ord)
)
where id = 'f3750c56-94b5-440c-8c09-7ea5ba07d1ce';

-- PIR 22 · pregunta · 'la tarea Pá de preparar' -> 'la tarea de preparar'
update preguntas
set pregunta = replace(pregunta, 'la tarea Pá de preparar', 'la tarea de preparar')
where id = '25531abd-6757-4cf5-80c1-192ae411bc49';

-- PIR 20 · pregunta · 'déficits cognitivoperceptivos' -> 'déficits cognitivo-perceptivos'
update preguntas
set pregunta = replace(pregunta, 'déficits cognitivoperceptivos', 'déficits cognitivo-perceptivos')
where id = '7f78949c-9a42-4af2-aa2a-083be7f0bfa4';

-- PIR 24 · opcion · 'trastorno desafianteoposicionista' -> 'trastorno desafiante-oposicionista'
update preguntas
set opciones = (
  select jsonb_agg(
    to_jsonb(replace(elem, 'trastorno desafianteoposicionista', 'trastorno desafiante-oposicionista'))
    order by ord
  )
  from jsonb_array_elements_text(opciones::jsonb) with ordinality as t(elem, ord)
)
where id = 'dd4a1e8e-2230-4700-a3f0-e2cc0b2d0990';

-- PIR 24 · opcion · 'estabilidadinestabilidad' -> 'estabilidad-inestabilidad'
update preguntas
set opciones = (
  select jsonb_agg(
    to_jsonb(replace(elem, 'estabilidadinestabilidad', 'estabilidad-inestabilidad'))
    order by ord
  )
  from jsonb_array_elements_text(opciones::jsonb) with ordinality as t(elem, ord)
)
where id = '520301da-4af0-4dac-92a7-16bf5fb3b03d';

-- PIR 23 · opcion · 'individualismocolectivismo' -> 'individualismo-colectivismo'
update preguntas
set opciones = (
  select jsonb_agg(
    to_jsonb(replace(elem, 'individualismocolectivismo', 'individualismo-colectivismo'))
    order by ord
  )
  from jsonb_array_elements_text(opciones::jsonb) with ordinality as t(elem, ord)
)
where id = '107ead19-0d41-491b-9d18-bcdedecc32a9';

-- PIR 24 · opcion · 'despersonalizacióndesrealización' -> 'despersonalización-desrealización'
update preguntas
set opciones = (
  select jsonb_agg(
    to_jsonb(replace(elem, 'despersonalizacióndesrealización', 'despersonalización-desrealización'))
    order by ord
  )
  from jsonb_array_elements_text(opciones::jsonb) with ordinality as t(elem, ord)
)
where id = '2936ea39-fd4a-4e54-84d3-e17f6c9bf015';

-- PIR 21 · pregunta · 'dialécticoconductual' -> 'dialéctico-conductual'
update preguntas
set pregunta = replace(pregunta, 'dialécticoconductual', 'dialéctico-conductual')
where id = '2066f69b-e073-42f6-8d1f-9ebb3d7a6cf6';

-- PIR 21 · pregunta · 'dialécticoconductual' -> 'dialéctico-conductual'
update preguntas
set pregunta = replace(pregunta, 'dialécticoconductual', 'dialéctico-conductual')
where id = '65a25c39-1066-4e2a-8f3a-2dc7e7df7662';

-- PIR 22 · opcion · 'complejo pontomesencefálicocontrol del estado de ánimo' -> 'complejo pontomesencefálico – control del estado de ánimo'
update preguntas
set opciones = (
  select jsonb_agg(
    to_jsonb(replace(elem, 'complejo pontomesencefálicocontrol del estado de ánimo', 'complejo pontomesencefálico – control del estado de ánimo'))
    order by ord
  )
  from jsonb_array_elements_text(opciones::jsonb) with ordinality as t(elem, ord)
)
where id = 'c881e48f-0412-4268-99e4-70ab169ae130';

-- Comprobación: debería devolver las 16 filas ya corregidas.
select id, curso, tema, pregunta, opciones
from preguntas
where id in (
  'a575d31a-058e-4221-b2d0-a427790af9e0',
  '710eed69-e424-40fa-a567-8536ef42652d',
  'f5ad118b-4483-4830-be9a-9593600e51e1',
  '5f05c5ba-6308-4f42-bdf6-3a2fa68cfe99',
  '878e8df6-f2f4-4078-92c2-ddad117d8d4d',
  'ac7fc9c2-ac7f-428c-a62f-52f9d499669a',
  'f3750c56-94b5-440c-8c09-7ea5ba07d1ce',
  '25531abd-6757-4cf5-80c1-192ae411bc49',
  '7f78949c-9a42-4af2-aa2a-083be7f0bfa4',
  'dd4a1e8e-2230-4700-a3f0-e2cc0b2d0990',
  '520301da-4af0-4dac-92a7-16bf5fb3b03d',
  '107ead19-0d41-491b-9d18-bcdedecc32a9',
  '2936ea39-fd4a-4e54-84d3-e17f6c9bf015',
  '2066f69b-e073-42f6-8d1f-9ebb3d7a6cf6',
  '65a25c39-1066-4e2a-8f3a-2dc7e7df7662',
  'c881e48f-0412-4268-99e4-70ab169ae130'
)
order by curso, id;
