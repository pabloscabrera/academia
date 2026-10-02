-- Diagnóstico, solo lectura. Tercera vuelta: afinar el acierto y, sobre todo,
-- buscar lo contrario — una señal de DESCARTE.
--
-- La de descarte es la novedad: la opción que (a) comparte menos palabras con
-- las otras tres y (b) además es más corta que la media de su pregunta. Es el
-- distractor de relleno, el que el autor escribió sin pensar y se queda
-- descolgado del resto.
--
-- "rel" es la longitud de la opción dividida por la media de su pregunta, para
-- comparar preguntas de enunciados largos con otras de enunciados cortos.

with o as (
  select p.id, p.correcta, (t.ord - 1)::int as idx, (t.opt #>> '{}') as texto
  from public.preguntas p,
       lateral jsonb_array_elements(p.opciones) with ordinality as t(opt, ord)
  where coalesce(p.inventada, false) = false
    and jsonb_array_length(p.opciones) = 4
    and p.correcta between 0 and 3
),
med as (
  select id, avg(length(texto))::float as largo_medio from o group by id
),
w as (  -- palabras de 4+ letras de cada opción, sin repetir
  select distinct x.id, x.idx, lower(p.w) as w
  from o x, lateral regexp_split_to_table(x.texto, '[^[:alpha:]]+') as p(w)
  where length(p.w) >= 4
),
tam as (select id, idx, count(*)::float as n from w group by id, idx),
comun as (
  select a.id, a.idx as i, b.idx as j, count(*)::float as c
  from w a join w b on a.id = b.id and a.idx <> b.idx and a.w = b.w
  group by a.id, a.idx, b.idx
),
sim as (  -- Jaccard de cada par de opciones de la misma pregunta
  select t1.id, t1.idx as i,
         coalesce(k.c, 0) / nullif(t1.n + t2.n - coalesce(k.c, 0), 0) as s
  from tam t1
  join tam t2 on t2.id = t1.id and t2.idx <> t1.idx
  left join comun k on k.id = t1.id and k.i = t1.idx and k.j = t2.idx
),
cen as (select id, i as idx, sum(coalesce(s, 0)) as c from sim group by id, i),
op as (
  select o.id, o.correcta, o.idx, o.texto,
         length(o.texto) / m.largo_medio                            as rel,
         coalesce(c.c, 0)                                           as central,
         o.texto ilike '% o %'                                      as con_o
  from o join med m on m.id = o.id left join cen c on c.id = o.id and c.idx = o.idx
),
marcas as (
  select id, correcta, idx, con_o, rel,
         central = min(central) over (partition by id)
           and count(*) filter (where true) over (partition by id, central) = 1 as menos_central
  from op
),
f as (
  select id, correcta,
         count(*) filter (where con_o)                                   as k_o,
         bool_or(idx = correcta and con_o)                               as o_ok,
         count(*) filter (where con_o and rel >= 1.0)                     as k_ol,
         bool_or(idx = correcta and con_o and rel >= 1.0)                 as ol_ok,
         count(*) filter (where menos_central and rel < 0.9)              as k_d,
         bool_or(idx = correcta and menos_central and rel < 0.9)          as d_ok,
         count(*) filter (where menos_central and rel < 0.8)              as k_d8,
         bool_or(idx = correcta and menos_central and rel < 0.8)          as d8_ok,
         count(*) filter (where rel < 0.9 and not menos_central)          as k_c,
         bool_or(idx = correcta and rel < 0.9 and not menos_central)      as c_ok
  from marcas group by id, correcta
)
select 'ACIERTO  lleva " o "' as pista, count(*) as preguntas,
       count(*) filter (where o_ok) as acierta, round((sum(k_o)/4.0)::numeric, 1) as esperado
  from f where k_o between 1 and 3
union all
select 'ACIERTO  " o " y no es corta', count(*),
       count(*) filter (where ol_ok), round((sum(k_ol)/4.0)::numeric, 1)
  from f where k_ol between 1 and 3
union all
select 'DESCARTE suelta y corta (<0,9x)', count(*),
       count(*) filter (where d_ok), round((sum(k_d)/4.0)::numeric, 1)
  from f where k_d between 1 and 3
union all
select 'DESCARTE suelta y muy corta (<0,8x)', count(*),
       count(*) filter (where d8_ok), round((sum(k_d8)/4.0)::numeric, 1)
  from f where k_d8 between 1 and 3
union all
select 'control  corta pero NO suelta', count(*),
       count(*) filter (where c_ok), round((sum(k_c)/4.0)::numeric, 1)
  from f where k_c between 1 and 3;
