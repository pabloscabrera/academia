-- "apnea/hipoapnea" -> "apnea/hipopnea" en la pregunta del SAHOS de PIR 20.
--
-- Salió al comprobar, contra el cuaderno oficial de 2020, que ninguna pregunta
-- real del examen se hubiera perdido al colarse las 25 de 2024. La pregunta 57
-- del oficial "no aparecía" en nuestro banco, y resultó que sí estaba: lo que
-- no coincidía era el texto. El Ministerio escribe "apnea/hipopnea" (que es
-- además la forma correcta: hipopnea, respiración superficial) y nosotros
-- teníamos "hipoapnea", con una "a" de más.
--
-- Es la MISMA fila que ya tocó `supabase-arreglar-explicacion-sahos-pir20.sql`,
-- que le devolvió la barra a "apneahipoapnea" pero dejó la palabra mal escrita
-- — se arregló el separador sin mirar la ortografía, y así se quedó.
--
-- Está TRES veces en la fila: una en `pregunta` y dos en `explicacion`, y la
-- tercera va suelta ("en el caso de la hipoapnea se sitúa en torno al 35-90%"),
-- sin el "apnea/" delante. Por eso se sustituye la palabra sola y no la pareja:
-- un primer intento que buscaba "apnea/hipoapnea" se dejó esa tercera, y solo
-- se vio porque la comprobación final seguía devolviendo la fila.
-- Acotado por `curso` más un trozo estable del enunciado. Idempotente.

update public.preguntas
set pregunta    = replace(pregunta,    'hipoapnea', 'hipopnea'),
    explicacion = replace(explicacion, 'hipoapnea', 'hipopnea')
where curso = 'PIR 20'
  and pregunta like 'El diagnóstico de síndrome de la apnea/hipo%obstructiva del sueño (SAHOS)%';

-- Comprobación: tiene que devolver 0 filas.
select id, curso, left(pregunta, 70) as pregunta
from public.preguntas
where pregunta like '%hipoapnea%' or explicacion like '%hipoapnea%';
