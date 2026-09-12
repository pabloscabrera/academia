-- Reset de puntuaciones solicitado por el usuario:
--   1) Reset completo de Pablo (pabloadmin, guardado como name='Pablo') y pepe.
--   2) Vaciar el histórico de ranking de TODOS los jugadores (racha_record,
--      racha_duelos_record) y la tabla ranking entera.
--
-- IMPORTANTE: revisa los valores de `name` antes de ejecutar. `rachas.name`
-- es el nombre mostrado, no el usuario de login: la cuenta admin se guarda
-- como 'Pablo' (por ADMIN_NAME), no como 'pabloadmin'. Confirma que 'pepe'
-- es exactamente como se registró (mayúsculas/minúsculas incluidas) antes
-- de correr esto — ejecuta primero el SELECT de abajo para comprobarlo.

-- Comprobación previa (no destructiva): ver qué filas de rachas coinciden
select name, racha_actual, racha_record, total_correctas, total_respondidas,
       correctas_hoy, racha_dias_actual, racha_dias_record, correctas_semana,
       racha_duelo_actual, racha_duelos_record
from rachas
where name in ('Pablo', 'pepe');

-- 1) Reset completo de Pablo y pepe
update rachas
set
  racha_actual = 0,
  racha_record = 0,
  total_correctas = 0,
  total_respondidas = 0,
  correctas_hoy = 0,
  fecha_correctas_hoy = null,
  racha_dias_actual = 0,
  racha_dias_record = 0,
  correctas_semana = 0,
  racha_duelo_actual = 0,
  racha_duelos_record = 0
where name in ('Pablo', 'pepe');

delete from ranking
where name in ('Pablo', 'pepe');

-- 2) Vaciar el histórico de ranking de TODOS los jugadores
update rachas
set racha_record = 0,
    racha_duelos_record = 0;

delete from ranking;
