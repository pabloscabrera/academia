-- ============================================================================
-- DIAGNÓSTICO (solo lectura): preguntas con OPCIONES REPETIDAS.
--
-- Por qué existe. El usuario encontró en la app una pregunta de PIR 25 con tres
-- de las cuatro opciones prácticamente iguales ("El valor p indica que... la
-- probabilidad de que la hipótesis nula sea cierta sería de 0,1%", repetida con
-- y sin un "de"). Eso no es un distractor: es texto que se duplicó al importar
-- y que se llevó por delante la opción real que debería ocupar ese hueco.
--
-- LO QUE NO FUNCIONA, medido y no supuesto. La tentación es buscar opciones
-- "parecidas". Se probó sobre las 1067 preguntas transcritas en este repo, con
-- dos medidas (solapamiento de palabras tipo Jaccard, y prefijo+sufijo común):
-- saltaron 53 y 57 casos respectivamente, y CASI TODOS ERAN LEGÍTIMOS —
-- "3 segundos" contra "5 segundos", "validez interna" contra "validez externa",
-- "más en mujeres que en hombres" contra "más en hombres que en mujeres".
-- Cambiar una palabra o un número ES como se construye un distractor del PIR,
-- así que "se parecen mucho" no distingue nada en este banco. Por eso este
-- diagnóstico NO busca parecido: busca IGUALDAD bajo tres normalizaciones, que
-- sobre esas mismas 1067 preguntas dieron 1 acierto real y CERO falsos
-- positivos.
--
--   1. iguales tal cual (minúsculas, sin tildes, espacios colapsados, sin el
--      punto final)
--   2. iguales al quitar TODO lo que no sea letra o cifra
--   3. iguales al quitar además las palabras vacías (de, la, que, en...), que
--      es lo que caza el "El valor p" / "El valor de p" de la captura: quitar
--      un "de" no cambia el significado, así que dos opciones que solo se
--      diferencian en eso no son dos opciones, son una repetida.
--
-- LA COLUMNA QUE HAY QUE MIRAR PRIMERO es `toca_la_correcta`. Si la repetida es
-- la marcada como correcta, hay dos opciones idénticas y solo una cuenta como
-- buena: puedes contestar lo mismo que pone la correcta y que te la den por
-- fallada. Eso no es cosmético.
--
-- No arregla nada: cada caso necesita el documento original para saber qué
-- decía la opción que se perdió. Mismo criterio que los demás `detectar-*`.
-- ============================================================================

with ops as (
  select p.id, p.curso, p.tema, p.pregunta, p.correcta,
         o.ord - 1 as idx, o.txt
  from public.preguntas p
  cross join lateral jsonb_array_elements_text(p.opciones) with ordinality as o(txt, ord)
),
plano as (
  -- `translate` en vez de la extensión `unaccent`, que no consta instalada.
  select id, curso, tema, pregunta, correcta, idx, txt,
         btrim(
           regexp_replace(
             lower(translate(txt, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')),
             '\s+', ' ', 'g'),
           ' .') as t
  from ops
),
claves as (
  select plano.*,
         regexp_replace(t, '[^a-z0-9]', '', 'g') as solo_alfa,
         (select string_agg(w, ' ' order by i)
            from unnest(regexp_split_to_array(regexp_replace(t, '[^a-z0-9]', ' ', 'g'), '\s+'))
                 with ordinality as u(w, i)
           where w <> ''
             and w not in ('de','del','la','el','los','las','un','una','unos','unas',
                           'y','o','e','u','que','en','a','al','se','su','sus','lo')
         ) as sin_vacias
  from plano
)
select
  a.curso,
  a.tema,
  left(a.pregunta, 90) as pregunta,
  a.idx  as opcion_a,
  b.idx  as opcion_b,
  case
    when a.t = b.t                   then '1 · iguales tal cual'
    when a.solo_alfa = b.solo_alfa   then '2 · iguales sin puntuacion'
    else                                  '3 · iguales sin palabras vacias'
  end as motivo,
  (a.correcta in (a.idx, b.idx)) as toca_la_correcta,
  left(a.txt, 120) as texto_a,
  left(b.txt, 120) as texto_b,
  a.id
from claves a
join claves b
  on a.id = b.id
 and a.idx < b.idx
where coalesce(a.solo_alfa, '') <> ''
  and ( a.t = b.t
     or a.solo_alfa = b.solo_alfa
     or a.sin_vacias = b.sin_vacias )
order by (a.correcta in (a.idx, b.idx)) desc, a.curso, a.tema, a.idx;

-- ---------------------------------------------------------------------------
-- Resumen por examen, para pegarlo en el chat de un vistazo.
-- ---------------------------------------------------------------------------
with ops as (
  select p.id, p.curso, p.correcta, o.ord - 1 as idx, o.txt
  from public.preguntas p
  cross join lateral jsonb_array_elements_text(p.opciones) with ordinality as o(txt, ord)
),
plano as (
  select id, curso, correcta, idx,
         btrim(regexp_replace(lower(translate(txt,'áéíóúüñÁÉÍÓÚÜÑ','aeiouunAEIOUUN')),'\s+',' ','g'), ' .') as t
  from ops
),
claves as (
  select plano.*,
         regexp_replace(t,'[^a-z0-9]','','g') as solo_alfa,
         (select string_agg(w,' ' order by i)
            from unnest(regexp_split_to_array(regexp_replace(t,'[^a-z0-9]',' ','g'),'\s+')) with ordinality as u(w,i)
           where w <> '' and w not in ('de','del','la','el','los','las','un','una','unos','unas',
                                       'y','o','e','u','que','en','a','al','se','su','sus','lo')
         ) as sin_vacias
  from plano
),
malas as (
  select distinct a.id, a.curso, (a.correcta in (a.idx, b.idx)) as toca
  from claves a join claves b on a.id = b.id and a.idx < b.idx
  where coalesce(a.solo_alfa,'') <> ''
    and (a.t = b.t or a.solo_alfa = b.solo_alfa or a.sin_vacias = b.sin_vacias)
)
select curso,
       count(distinct id)                                as preguntas_afectadas,
       count(distinct id) filter (where toca)            as afectan_a_la_correcta
from malas
group by curso
order by preguntas_afectadas desc, curso;
