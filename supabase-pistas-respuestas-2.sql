-- Diagnóstico, solo lectura. Segunda vuelta: la primera dejó claro que el
-- paréntesis no dice nada y que la longitud sí. Esta busca el porqué.
--
-- La hipótesis: lo que de verdad marca a la correcta no es ser LARGA, sino
-- ofrecer una ALTERNATIVA ("ira o culpa", "ideas o palabras"). Es la
-- redacción cuidadosa del que escribe el enunciado verdadero. Por eso van
-- juntas la disyunción (" o ") y la conjunción (" y ") como control: si solo
-- fuera "opciones compuestas", las dos subirían igual.
--
-- Cómo leerla: "esperado" es lo que saldría al azar; "veces" = acierta /
-- esperado. Solo cuentan las preguntas donde la pista discrimina (la llevan
-- entre 1 y 3 opciones).

with o as (
  select p.id, p.correcta, (t.ord - 1)::int as idx, (t.opt #>> '{}') as texto
  from public.preguntas p,
       lateral jsonb_array_elements(p.opciones) with ordinality as t(opt, ord)
  where coalesce(p.inventada, false) = false
    and jsonb_array_length(p.opciones) = 4
    and p.correcta between 0 and 3
),
a as (
  select id, correcta,
         count(*) filter (where texto ilike '% o %')                    as k_o,
         bool_or(idx = correcta and texto ilike '% o %')                as o_ok,
         count(*) filter (where texto ilike '% y %')                    as k_y,
         bool_or(idx = correcta and texto ilike '% y %')                as y_ok,
         count(*) filter (where texto ~* '\mno\M')                      as k_no,
         bool_or(idx = correcta and texto ~* '\mno\M')                  as no_ok,
         (array_agg(idx order by length(texto) desc, idx))[1]           as mas_larga
  from o group by id, correcta
),
b as (
  select a.*,
         (select x.texto ilike '% o %' from o x where x.id = a.id and x.idx = a.mas_larga) as larga_tiene_o
  from a
)
select 'lleva " o "' as pista, count(*) as preguntas,
       count(*) filter (where o_ok) as acierta, round(sum(k_o)/4.0, 1) as esperado
  from b where k_o between 1 and 3
union all
select 'lleva " o ", quitando donde es la mas larga', count(*),
       count(*) filter (where o_ok), round(sum(k_o)/4.0, 1)
  from b where k_o between 1 and 3 and not larga_tiene_o
union all
select 'lleva " y "  (control: deberia salir plano)', count(*),
       count(*) filter (where y_ok), round(sum(k_y)/4.0, 1)
  from b where k_y between 1 and 3
union all
select 'lleva "no"', count(*),
       count(*) filter (where no_ok), round(sum(k_no)/4.0, 1)
  from b where k_no between 1 and 3
union all
select 'es la mas larga, solo si ninguna lleva " o "', count(*),
       count(*) filter (where mas_larga = correcta), round(count(*)/4.0, 1)
  from b where k_o = 0;
