-- Arregla el caso puntual visto por el usuario en PIR 22: "dirigi do"
-- (palabra partida por un espacio de más en medio, artefacto de la
-- extracción del PDF — el contrario del caso "sentimientosnegativos" de
-- supabase-arreglar-pregunta-disforia-pir25.sql, donde faltaba un espacio;
-- aquí sobra uno) en vez de "dirigido".
--
-- Acotado por curso + un trozo de texto estable de la pregunta, para tocar
-- solo esta fila.

update preguntas
set pregunta = replace(pregunta, 'está dirigi do a medir', 'está dirigido a medir')
where id = 'f47ea8a6-1bed-4425-8a41-8cd18951cfe3';

-- Comprobación
select id, curso, tema, pregunta
from preguntas
where id = 'f47ea8a6-1bed-4425-8a41-8cd18951cfe3';
