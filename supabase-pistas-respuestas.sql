-- Diagnóstico, solo lectura: ¿hay alguna pista en la FORMA de las opciones que
-- delate cuál es la correcta? Devuelve una tabla pequeña, no las preguntas.
--
-- Cómo leerla: "esperado" es lo que saldría marcando al azar. Si "acierta" y
-- "esperado" se parecen, esa pista no vale para nada. Solo cuentan las
-- preguntas donde la pista DISCRIMINA (la llevan entre 1 y 3 opciones): si la
-- llevan las cuatro, o ninguna, esa pregunta no dice nada y se descarta.

with o as (
  select p.id,
         p.correcta,
         (t.ord - 1)::int as idx,
         (t.opt #>> '{}')  as texto
  from public.preguntas p,
       lateral jsonb_array_elements(p.opciones) with ordinality as t(opt, ord)
  where coalesce(p.inventada, false) = false
    and jsonb_array_length(p.opciones) = 4
    and p.correcta between 0 and 3
),
marcada as (
  select id, correcta,
         count(*) filter (where texto like '%(%')                       as k_par,
         bool_or(idx = correcta and texto like '%(%')                   as par_correcta,
         count(*) filter (where texto ~* '\m(siempre|nunca|todos|todas|ninguno|ninguna|exclusivamente|únicamente|solamente)\M') as k_abs,
         bool_or(idx = correcta and texto ~* '\m(siempre|nunca|todos|todas|ninguno|ninguna|exclusivamente|únicamente|solamente)\M') as abs_correcta
  from o group by id, correcta
),
largo as (
  select id, correcta,
         (array_agg(idx order by length(texto) desc, idx))[1] as mas_larga,
         (array_agg(idx order by length(texto) asc,  idx))[1] as mas_corta
  from o group by id, correcta
)
select 'lleva paréntesis'    as pista, count(*) as preguntas,
       count(*) filter (where par_correcta) as acierta,
       round(sum(k_par) / 4.0, 1)           as esperado
  from marcada where k_par between 1 and 3
union all
select 'palabra absoluta', count(*),
       count(*) filter (where abs_correcta),
       round(sum(k_abs) / 4.0, 1)
  from marcada where k_abs between 1 and 3
union all
select 'es la más larga', count(*),
       count(*) filter (where mas_larga = correcta),
       round(count(*) / 4.0, 1)
  from largo
union all
select 'es la más corta', count(*),
       count(*) filter (where mas_corta = correcta),
       round(count(*) / 4.0, 1)
  from largo;
