-- Comprobar QUÉ hay de verdad en la tabla de flashcards. SOLO LECTURA:
-- no inserta, no borra y no cambia nada.
--
-- Nace de un caso en el que las tarjetas importadas no aparecían en la app
-- (ni recién importadas, ni desde el icono de la pantalla de inicio), y desde
-- el cliente no había forma de distinguir entre tres causas muy distintas:
--
--   (a) las filas no llegaron a escribirse;
--   (b) se escribieron SIN dueño (`user_id` nulo) y entonces la política de
--       lectura (`auth.uid() = user_id`) las esconde para siempre, aunque
--       estén ahí;
--   (c) están bien y la pantalla se mira con OTRA cuenta.
--
-- Esta consulta las separa de un vistazo, porque el editor SQL de Supabase
-- NO pasa por esas políticas: enseña la tabla tal cual es.
select
  coalesce(u.raw_user_meta_data->>'username', '*** SIN DUEÑO (user_id nulo) ***') as cuenta,
  count(*)                      as tarjetas,
  count(distinct f.mazo)        as mazos,
  min(f.created_at)              as la_mas_vieja,
  max(f.created_at)              as la_mas_nueva
from flashcards f
left join auth.users u on u.id = f.user_id
group by 1
order by 2 desc;
