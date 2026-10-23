-- ¿Qué preguntas están repetidas en el banco, y en qué exámenes?
--
-- SOLO LECTURA. No borra ni cambia nada: es para mirar con los ojos, igual
-- que los otros `supabase-detectar-*.sql`.
--
-- CONTEXTO, para no volver a equivocarse con esto:
--   Los "Simulacro NN" del volcado original SON exámenes reales, y
--   `supabase-rename-simulacros.sql` ya les puso su edición:
--       Simulacro 1 -> PIR 25     Simulacro 4 -> PIR 22
--       Simulacro 2 -> PIR 24     Simulacro 5 -> PIR 21
--       Simulacro 3 -> PIR 23
--   Más PIR 15, 16, 18, 19 y 20, transcritos aparte de sus PDF.
--
--   CUIDADO con una colisión de títulos: DOS academias numeran su documento
--   "Simulacro 5". El de AMIR es PIR 21; el de APIR es PIR 20
--   (supabase-pir20-preguntas.sql). Son exámenes DISTINTOS y van separados:
--   el número de simulacro es de la academia, no de la edición. La consulta 2
--   sirve aquí de comprobación — si PIR 20 y PIR 21 comparten pocas
--   preguntas, está bien; un solapamiento casi total sería la alarma.
--
-- POR QUÉ IMPORTA UN DUPLICADO. No es que se vea feo: `preguntas_progreso` va
-- por `id`, así que contestar una copia deja la otra a cero y vuelve a salir
-- en "Pendientes" — nunca terminas el banco.
--
-- Cómo se comparan. Minúsculas, espacios colapsados y sin el punto final, que
-- es lo que cambia entre dos transcripciones del mismo enunciado. NO se quitan
-- los acentos (haría falta la extensión `unaccent`), así que dos copias con
-- distinta acentuación se escaparían; por eso esto es un diagnóstico y no una
-- limpieza automática.


-- ---------------------------------------------------------------------------
-- 1. Resumen: el tamaño del asunto, antes de decidir nada.
-- ---------------------------------------------------------------------------
with norm as (
  select rtrim(regexp_replace(lower(trim(pregunta)), '\s+', ' ', 'g'), '. ') as clave
  from public.preguntas
),
grupos as (select clave, count(*) as veces from norm group by clave having count(*) > 1)
select
  (select count(*) from public.preguntas)            as preguntas_en_total,
  (select count(*) from grupos)                      as enunciados_repetidos,
  (select coalesce(sum(veces - 1), 0) from grupos)   as filas_de_sobra;


-- ---------------------------------------------------------------------------
-- 2. ¿Hay dos EXÁMENES ENTEROS que sean el mismo documento con dos etiquetas?
--
-- Esta es la que de verdad decide qué hacer. Si dos cursos comparten casi
-- todas sus preguntas, el problema no son diez duplicados sueltos: es que un
-- examen se importó dos veces con nombres distintos, y entonces lo que se
-- borra es un curso entero y no fila a fila.
-- Solo se listan los pares con 5 o más preguntas en común, para que no salga
-- ruido de las preguntas que coinciden por casualidad entre dos ediciones.
-- ---------------------------------------------------------------------------
with norm as (
  select curso, rtrim(regexp_replace(lower(trim(pregunta)), '\s+', ' ', 'g'), '. ') as clave
  from public.preguntas
),
tam as (select curso, count(*) as total from norm group by curso)
select
  a.curso as curso_a, b.curso as curso_b,
  count(*) as en_comun,
  ta.total as tiene_a, tb.total as tiene_b,
  round(100.0 * count(*) / least(ta.total, tb.total), 1) as pct_del_mas_pequeno
from norm a
join norm b on a.clave = b.clave and a.curso < b.curso
join tam ta on ta.curso = a.curso
join tam tb on tb.curso = b.curso
group by a.curso, b.curso, ta.total, tb.total
having count(*) >= 5
order by pct_del_mas_pequeno desc, en_comun desc;


-- ---------------------------------------------------------------------------
-- 3. El detalle, una fila por copia.
--
-- `copias_identicas` compara también las OPCIONES: dos preguntas con el mismo
-- enunciado y distintas respuestas son preguntas distintas, y borrar una sería
-- perder contenido. Si ahí pone 1, esa fila no se toca sin mirarla.
-- `tiene_explicacion` es el criterio para elegir cuál se queda.
-- ---------------------------------------------------------------------------
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
  left(n.pregunta, 70)                                 as enunciado,
  n.curso,
  n.tema,
  n.correcta,
  (n.explicacion is not null and n.explicacion <> '')  as tiene_explicacion,
  count(*) over (partition by n.clave, n.opc_norm)     as copias_identicas,
  n.id
from norm n
join grupos g on g.clave = n.clave
order by g.veces desc, n.clave, n.curso, n.id;
