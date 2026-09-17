-- Arregla a mano el caso concreto visto por el usuario en PIR 25: un
-- fragmento suelto "Pá" colado a mitad de frase y una palabra pegada sin
-- espacio ("sentimientosnegativos"), ambos artefactos de la transcripción
-- del PDF original (ver supabase-detectar-fragmentos-preguntas.sql).
--
-- Acotado con curso + un trozo de texto que no cambia, para tocar solo esta
-- fila exacta.

update preguntas
set pregunta = regexp_replace(
  regexp_replace(pregunta, 'tener Pá una', 'tener una'),
  'sentimientosnegativos', 'sentimientos negativos'
)
where curso = 'PIR 25'
  and pregunta like '%disforia por la integridad corporal%';

-- Comprobación
select id, curso, tema, pregunta
from preguntas
where curso = 'PIR 25'
  and pregunta like '%disforia por la integridad corporal%';
