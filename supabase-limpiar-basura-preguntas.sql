-- Limpieza: quita el "punto duplicado + número suelto" pegado al final de
-- algunas opciones (ej. "...para no sentirse sucio. . 48" -> "...para no
-- sentirse sucio."), artefacto de la transcripción del PDF de varios
-- exámenes (PIR 21-25).
--
-- Revisadas a mano las 60 filas que detectó supabase-detectar-basura-
-- preguntas.sql: en todos los casos el número final es basura (el número de
-- pregunta o nota al pie del PDF original), nunca un dato real — incluso en
-- opciones que sí tienen cifras legítimas en medio de la frase (ej. "0,005",
-- "40-50%"), el número basura va siempre pegado DESPUÉS del punto final,
-- por separado. Por eso se puede limpiar en bloque con este patrón.
--
-- Solo toca las filas que tienen el patrón (la condición WHERE es la misma
-- que en la consulta de diagnóstico); dentro de esas filas, solo cambia el
-- texto de la opción que realmente coincide, las demás quedan igual.

update preguntas
set opciones = (
  select jsonb_agg(
    to_jsonb(regexp_replace(elem, '(\.\s*)+\d{1,4}\s*$', '.'))
    order by ord
  )
  from jsonb_array_elements_text(opciones::jsonb) with ordinality as t(elem, ord)
)
where exists (
  select 1 from jsonb_array_elements_text(opciones::jsonb) as opcion
  where opcion ~ '\.\s*\.?\s*\d{1,4}\s*$'
);

-- Comprobación: debería devolver 0 filas.
select id, curso, tema, opciones
from preguntas
where exists (
  select 1 from jsonb_array_elements_text(opciones::jsonb) as opcion
  where opcion ~ '\.\s*\.?\s*\d{1,4}\s*$'
);
