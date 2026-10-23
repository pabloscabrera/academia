-- PIR 20 tenía 25 preguntas que son del examen OFICIAL DE 2024, no del de 2020.
--
-- CÓMO SE SUPO. El usuario encontró una pregunta repetida en PIR 20 y PIR 24 y
-- no se creyó la explicación de "el PIR repite preguntas". Tenía razón. Con los
-- dos cuadernos oficiales del Ministerio delante ("PRUEBAS SELECTIVAS 2020",
-- 175+10, y "PRUEBAS SELECTIVAS 2024", 200+10) se comprobaron las 198 filas de
-- `supabase-pir20-preguntas.sql` una a una contra el texto de los dos PDF:
--
--     173 están en el oficial de 2020   <- las que de verdad son PIR 20
--      25 están en el oficial de 2024   <- las que sobran aquí
--       0 están en los dos
--
-- Ese último cero es la clave: **el PIR no repitió ninguna**. Y las cuentas
-- cierran solas: 185 preguntas del cuaderno de 2020 + 25 coladas de 2024 = 210,
-- que es justo el "210 preguntas totales" que decía la cabecera del fichero de
-- importación, y 210 - 12 anuladas = 198, las que se insertaron. O sea que el
-- documento del que se transcribió ya venía mezclado, y el "210" se tomó por el
-- tamaño del examen de 2020 cuando no lo era.
--
-- QUÉ HACE ESTE SCRIPT
--   1. Las 23 que están repetidas en PIR 24: la copia de PIR 20 lleva tema y
--      explicación y la de PIR 24 no, así que **primero se traspasan** y luego
--      se borra la de PIR 20. No se pierde ni una explicación.
--   2. Las 2 que no están en PIR 24 (preguntas 22 y 36 del oficial de 2024):
--      no se borran, se **reetiquetan** a PIR 24, que es su sitio.
--
-- Resultado: PIR 20 queda con 173 (el examen de 2020 sin las anuladas) y PIR 24
-- gana 2. El banco pasa de 2102 a 2079.
--
-- AVISO: lo que hubieras contestado sobre las 23 copias de PIR 20 se pierde al
-- borrarlas; lo de PIR 24 se conserva. Son 23 preguntas, y a cambio dejan de
-- salirte dos veces.
--
-- Idempotente: ejecutarlo dos veces no hace nada la segunda.

begin;

-- Misma normalización que `supabase-detectar-preguntas-repetidas.sql`.
create temporary view _norm as
select id, curso, tema, explicacion,
       rtrim(regexp_replace(lower(trim(pregunta)), '\s+', ' ', 'g'), '. ') as clave
from public.preguntas;

-- 1a. El tema y la explicación de la copia de PIR 20 pasan a la de PIR 24.
update public.preguntas d
set tema        = o.tema,
    explicacion = o.explicacion
from _norm nd, _norm no, public.preguntas o
where d.id = nd.id and o.id = no.id
  and nd.curso = 'PIR 24' and no.curso = 'PIR 20'
  and nd.clave = no.clave
  and (d.explicacion is null or d.explicacion = '')
  and o.explicacion is not null and o.explicacion <> '';

-- 1b. Ya trasvasado, se borra la copia sobrante de PIR 20.
delete from public.preguntas p
using _norm np
where p.id = np.id and np.curso = 'PIR 20'
  and exists (select 1 from _norm q where q.curso = 'PIR 24' and q.clave = np.clave);

-- 2. Las dos que son de 2024 y NO estaban en PIR 24: se mudan, no se borran.
--    Acotadas por un trozo estable del enunciado, no por el texto entero.
update public.preguntas
set curso = 'PIR 24'
where curso = 'PIR 20'
  and (pregunta like 'Según la CIE-11, señale la alternativa FALSA sobre la escala%ADNM%'
    or pregunta like '%conceptos NO se considera una de las principales manifestaciones del egocentrismo intelectual%');

commit;

-- Comprobación para pegar en el chat. Esperado: PIR 20 = 173, PIR 24 = 210,
-- total = 2079, y 0 preguntas compartidas entre los dos cursos.
select curso, count(*) as preguntas
from public.preguntas where curso in ('PIR 20', 'PIR 24') group by curso order by curso;

select count(*) as total_banco from public.preguntas;

with n as (
  select curso, rtrim(regexp_replace(lower(trim(pregunta)), '\s+', ' ', 'g'), '. ') as clave
  from public.preguntas where curso in ('PIR 20','PIR 24')
)
select count(*) as siguen_compartidas
from n a join n b on a.clave = b.clave and a.curso = 'PIR 20' and b.curso = 'PIR 24';
