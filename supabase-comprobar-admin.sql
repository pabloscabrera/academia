-- Comprobación (no destructiva): ¿alguien más se ha registrado con el
-- nombre de usuario admin ("pabloadmin", case-insensitive) o con un email
-- que se le parezca? En este proyecto quien se registre exactamente como
-- "pabloadmin" se convierte en administrador (ver ADMIN_NAME en src/App.jsx),
-- así que solo debería existir una fila aquí.
select id, email, raw_user_meta_data->>'username' as username, created_at
from auth.users
where lower(raw_user_meta_data->>'username') = 'pabloadmin'
   or lower(email) like 'pabloadmin%@ruta-pir.local';

-- Lista completa de usuarios registrados, para revisar de un vistazo que
-- solo están las cuentas que reconoces:
select id, email, raw_user_meta_data->>'username' as username, created_at
from auth.users
order by created_at asc;
