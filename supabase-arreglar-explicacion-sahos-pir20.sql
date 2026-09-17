-- Arregla otro artefacto de transcripción encontrado al revisar los
-- resultados de supabase-detectar-fragmentos-preguntas.sql: "apneahipoapnea"
-- sin guion/barra, en la explicación de la pregunta de Psicopatología
-- Clínica (PIR 20) sobre el SAHOS — el resto del texto sí usa correctamente
-- "apnea/hipoapnea" en otras dos ocasiones.
--
-- Acotado por id exacto para no tocar ninguna otra fila.

update preguntas
set explicacion = replace(explicacion, 'índice de apneahipoapnea', 'índice de apnea-hipoapnea')
where id = '90887b49-6094-43e9-9adf-5147ea91cb52';

-- Comprobación
select id, curso, tema, explicacion
from preguntas
where id = '90887b49-6094-43e9-9adf-5147ea91cb52';
