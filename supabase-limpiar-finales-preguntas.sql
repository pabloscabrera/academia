-- Limpieza de finales raros en `pregunta`, revisados a mano contra los
-- resultados de supabase-detectar-finales-raros.sql (26 filas, PIR 20-25).
--
-- 24 de las 26 son el mismo artefacto que ya se limpió en las opciones,
-- pero pegado DESPUÉS del final correcto de la pregunta (":" o "?:"), p.ej.
-- "...NO jerárquica?: . 14" -> "...NO jerárquica?:". Aquí el sobrante se
-- BORRA entero (no se sustituye por un punto, porque el final correcto ya
-- está puesto antes: los dos puntos o el interrogante).
--
-- Las otras 2 filas NO son basura / son un caso distinto, y se excluyen o
-- se tratan aparte:
--   - db0de712-2eb3-4f48-b7be-731cf8e4a2ef: termina en punto normal, es una
--     pregunta en forma de instrucción ("Señale..."), no le falta nada.
--     No coincide con el patrón de abajo (no tiene número al final), así
--     que ya queda fuera automáticamente.
--   - 5d85340e-265a-4afd-94ed-fa224b8b30f2: termina en una comilla
--     tipográfica de cierre sobrante ("discurso?:”"), no en un número. Se
--     limpia aparte, en su propio UPDATE.

update preguntas
set pregunta = regexp_replace(pregunta, '\s*\.\s*\d{1,4}\s*$', '')
where pregunta ~ '\s*\.\s*\d{1,4}\s*$';

update preguntas
set pregunta = regexp_replace(pregunta, '[”"]\s*$', '')
where id = '5d85340e-265a-4afd-94ed-fa224b8b30f2';

-- Comprobación: debería devolver 0 filas (aparte de la fila db0de712, que
-- es correcta tal cual y se queda fuera a propósito).
select id, curso, tema, pregunta
from preguntas
where pregunta !~ '[:?]\s*$'
  and id <> 'db0de712-2eb3-4f48-b7be-731cf8e4a2ef';
