-- ¿Qué preguntas están repetidas en el banco, y en qué exámenes?
--
-- SOLO LECTURA. No borra ni cambia nada: lista para mirar con los ojos, igual
-- que los otros `supabase-detectar-*.sql`.
--
-- POR QUÉ EXISTE. El usuario encontró la misma pregunta ("Lecho de Procusto")
-- en PIR 24 y en PIR 20 y pensó que la app la estaba duplicando. No lo hace:
-- las dos filas son reales y vienen de sitios distintos. Conviene tener esto
-- presente antes de borrar nada:
--
--   * "PIR 21".."PIR 25" NO son los exámenes oficiales de esos años: son
--     simulacros de academia que se renombraron así (ver
--     supabase-rename-simulacros.sql).
--   * "PIR 20" tampoco: es el simulacro 5 de APIR
--     (ver supabase-pir20-preguntas.sql).
--   * Los oficiales de verdad son PIR 15, 16, 18 y 19.
--
-- Y los simulacros de academia RECICLAN preguntas de exámenes oficiales, así
-- que la misma pregunta aparece legítimamente en dos sitios. No es un fallo de
-- importación: es que se importaron dos documentos que la contenían.
--
-- LO QUE SÍ MOLESTA, y es la razón para mirarlo: el progreso va por `id`, así
-- que contestar una deja la otra a cero y vuelve a salir como pendiente.
--
-- Cómo se comparan. Minúsculas, espacios colapsados y sin el punto final, que
-- es lo que cambia entre dos transcripciones del mismo enunciado. NO se quitan
-- los acentos (haría falta la extensión `unaccent`), así que dos copias con
-- distinta acentuación se escaparían; por eso esto es un diagnóstico y no una
-- limpieza automática.

with norm as (
  select
    id, curso, tema, pregunta, opciones, correcta, explicacion,
    rtrim(regexp_replace(lower(trim(pregunta)), '\s+', ' ', 'g'), '. ') as clave,
    regexp_replace(lower(opciones::text), '\s+', ' ', 'g')              as opc_norm
  from public.preguntas
),
grupos as (
  select clave, count(*) as veces
  from norm group by clave having count(*) > 1
)
select
  g.veces                                              as copias,
  left(n.pregunta, 90)                                 as enunciado,
  n.curso,
  n.tema,
  n.correcta,
  (n.explicacion is not null and n.explicacion <> '')  as tiene_explicacion,
  -- Si las opciones NO coinciden entre las copias, no son la misma pregunta
  -- aunque compartan enunciado: puede ser una variante con otras respuestas.
  count(*) over (partition by n.clave, n.opc_norm)     as copias_identicas,
  n.id
from norm n
join grupos g on g.clave = n.clave
order by g.veces desc, n.clave, n.curso, n.id;

-- Resumen, para saber el tamaño del asunto antes de decidir nada.
with norm as (
  select rtrim(regexp_replace(lower(trim(pregunta)), '\s+', ' ', 'g'), '. ') as clave
  from public.preguntas
),
grupos as (select clave, count(*) as veces from norm group by clave having count(*) > 1)
select
  (select count(*) from public.preguntas)            as preguntas_en_total,
  (select count(*) from grupos)                      as enunciados_repetidos,
  (select coalesce(sum(veces - 1), 0) from grupos)   as filas_de_sobra;
