-- ============================================================================
-- PIR 25 · pregunta 14 (el valor de p): devolver las DOS opciones que se
-- perdieron al importar, y la respuesta correcta con ellas.
--
-- Lo detectó `supabase-detectar-opciones-repetidas.sql` y lo confirmó el
-- usuario mandando la fuente (APIR, Manual de Estadística, Tema 1). Lo que
-- había en la base contra lo que dice el documento:
--
--   opción real                                    en la base
--   1. …obtener una diferencia como la observada   PERDIDA: una copia de la 2
--      o mayor por azar… 0,1%   <-- LA CORRECTA
--   2. …la hipótesis nula sea cierta… 0,1%         ahí, repetida tres veces
--   3. …el tratamiento sea eficaz… 99,9%           PERDIDA: otra copia de la 2
--   4. …la diferencia encontrada sea              ahí, con "enconrada"
--      clínicamente relevante… 99,9%
--
-- O sea que se perdieron DOS opciones, no una, y una de ellas era la buena.
-- Por eso `correcta` apuntaba a un texto que dice "la probabilidad de que la
-- hipótesis nula sea cierta", que es **la interpretación FALSA de la p** y el
-- error más clásico que hay con ella: la pregunta estaba enseñando justo lo
-- contrario de lo que hay que saber, y marcándolo como bueno.
--
-- Se reescriben las cuatro opciones enteras en el orden del documento y
-- `correcta = 0`. No se parchea solo el hueco: tres de las cuatro estaban mal
-- (dos perdidas y una con una errata), así que remendar por trozos dejaría a
-- medias algo que la fuente da completo. De paso se corrige "enconrada" y el
-- "El valor de p" con un "de" de más que arrastraban tres opciones (el
-- documento dice "El valor p" en las cuatro).
--
-- Lo único que NO es literal del documento: el punto final de la opción 1,
-- que en la captura no se ve y que se añade para que las cuatro terminen
-- igual. Es cosmético y se deja dicho.
--
-- La `explicacion` solo se rellena SI ESTABA VACÍA (`coalesce`): si el
-- volcado de AMIR ya traía una, la suya se respeta — esta viene de otra
-- academia y no tiene por qué pisarla.
--
-- Acotado por `id` Y por un trozo estable del enunciado: si el id no fuera el
-- que se cree, la segunda condición impide tocar una fila cualquiera.
-- Idempotente: ejecutarlo dos veces deja exactamente lo mismo.
-- ============================================================================

update public.preguntas
set
  opciones = jsonb_build_array(
    'El valor p indica que, si en realidad no hubiera diferencias entre los grupos en la población (H0 cierta), la probabilidad de obtener una diferencia como la observada o mayor por azar sería de 0,1%.',
    'El valor p indica que, si en realidad no hubiera diferencias entre los grupos en la población (H0 cierta), la probabilidad de que la hipótesis nula sea cierta sería de 0,1%.',
    'El valor p indica que, si en realidad no hubiera diferencias entre los grupos en la población (H0 cierta), la probabilidad de que el tratamiento sea eficaz sería de 99,9%.',
    'El valor p indica que, si en realidad no hubiera diferencias entre los grupos en la población (H0 cierta), la probabilidad de que la diferencia encontrada sea clínicamente relevante sería de 99,9%.'
  ),
  correcta = 0,
  explicacion = coalesce(
    explicacion,
    'El valor p se define como la probabilidad de obtener un resultado igual o más extremo que el observado, asumiendo que la hipótesis nula es verdadera. Por lo tanto, siendo la hipótesis nula que no hay diferencias entre los grupos de tratamiento y control activo, si esto fuera cierto, la probabilidad de obtener una diferencia tan grande como la encontrada o mayor sería del 0,1% (opción 1 correcta). El resto de opciones son distractores, combinando los porcentajes con la definición del procedimiento de decisión (opciones 2, 3 y 4 incorrectas). Referencia: APIR Manual de Estadística, Método diferencial y Psicometría, Tema 1.'
  )
where id = '20ff8bfb-dc04-4b12-b635-3915f2114507'
  and pregunta like '%activación conductual en su hospital%';

-- ---------------------------------------------------------------------------
-- COMPROBACIÓN. Lo que tiene que salir: 4 opciones, 0 repetidas, y la correcta
-- empezando por "El valor p indica que, si en realidad... de obtener una
-- diferencia como la observada o mayor por azar".
-- ---------------------------------------------------------------------------
select
  curso,
  jsonb_array_length(opciones)                                   as n_opciones,
  jsonb_array_length(opciones)
    - (select count(distinct o) from jsonb_array_elements_text(opciones) o) as repetidas,
  correcta,
  left(opciones ->> correcta, 120)                               as texto_de_la_correcta,
  (explicacion is not null)                                      as tiene_explicacion
from public.preguntas
where id = '20ff8bfb-dc04-4b12-b635-3915f2114507';
