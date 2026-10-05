-- Quita los números de página sueltos que el PDF dejó incrustados a mitad de
-- frase: "...si la hipótesis de . 4 investigación es verdadera..." (PIR 23,
-- pregunta 11). Son 19 campos en 19 preguntas de PIR 21 a PIR 25.
--
-- El patrón distingue el artefacto de un número legítimo por un detalle: aquí
-- el punto va SUELTO, con espacio delante, mientras que en "1.000 mg", "CIDI
-- 3.0" o "1.6 varones" el punto va pegado a una cifra. De ahí
-- [[:space:]]+\.[[:space:]]*[0-9]+[[:space:]]+ : espacio, punto huérfano,
-- número y espacio, todo ello sustituido por un solo espacio.
--
-- Comprobado contra un Postgres 16 local cargado con las 2102 preguntas: toca
-- exactamente esos 19 campos y no altera ningún número real. Es idempotente:
-- volver a ejecutarlo no cambia nada.

begin;

update public.preguntas
   set pregunta = regexp_replace(pregunta,
         '[[:space:]]+\.[[:space:]]*[0-9]+[[:space:]]+', ' ', 'g')
 where pregunta ~ '[[:space:]]+\.[[:space:]]*[0-9]+[[:space:]]+';

update public.preguntas
   set explicacion = regexp_replace(explicacion,
         '[[:space:]]+\.[[:space:]]*[0-9]+[[:space:]]+', ' ', 'g')
 where explicacion ~ '[[:space:]]+\.[[:space:]]*[0-9]+[[:space:]]+';

-- Las opciones son un array jsonb: se reconstruye entero conservando el orden
-- (`with ordinality` + `order by`), porque el índice de cada opción es lo que
-- apunta `correcta`.
update public.preguntas p
   set opciones = (
         select jsonb_agg(
                  to_jsonb(regexp_replace(t.e #>> '{}',
                    '[[:space:]]+\.[[:space:]]*[0-9]+[[:space:]]+', ' ', 'g'))
                  order by t.ord)
           from jsonb_array_elements(p.opciones) with ordinality as t(e, ord))
 where exists (
         select 1 from jsonb_array_elements(p.opciones) x(e)
          where x.e #>> '{}' ~ '[[:space:]]+\.[[:space:]]*[0-9]+[[:space:]]+');

commit;

-- Comprobación: debe devolver 0 en las tres filas.
select 'pregunta' as campo, count(*) as quedan from public.preguntas
 where pregunta ~ '[[:space:]]+\.[[:space:]]*[0-9]+[[:space:]]+'
union all
select 'explicacion', count(*) from public.preguntas
 where explicacion ~ '[[:space:]]+\.[[:space:]]*[0-9]+[[:space:]]+'
union all
select 'opciones', count(*) from public.preguntas p
 where exists (select 1 from jsonb_array_elements(p.opciones) x(e)
                where x.e #>> '{}' ~ '[[:space:]]+\.[[:space:]]*[0-9]+[[:space:]]+');
