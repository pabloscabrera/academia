-- Diagnóstico de SOLO LECTURA. No cambia nada: se puede ejecutar sin miedo.
--
-- Para qué: la app ya avisa en pantalla cuando una escritura falla ("el
-- servidor no deja guardarlo", "falta algo en la base de datos"), pero ese
-- aviso dice la FAMILIA del problema, no cuál es la fila que falta. Esto lo
-- dice. Ejecutar en Supabase → SQL Editor → New query → Run, y pegar las tres
-- tablas de resultados.
--
-- La lección que ya costó un disgusto en este proyecto y por la que existe
-- este fichero: que una migración esté guardada en el repositorio NO es
-- prueba de que llegara a ejecutarse en la base de datos.

-- 1) ¿Existen las tablas que la app escribe?
select t.nombre,
       (to_regclass('public.' || t.nombre) is not null) as existe
from (values ('favoritos'), ('flashcards'), ('flashcards_progreso'),
             ('mazos_estilo'), ('preguntas_progreso'), ('fallos'), ('rachas')) as t(nombre)
order by existe, t.nombre;

-- 2) ¿Están las columnas de las que depende lo nuevo?
--    `flashcards.grupo_id` es lo que permite copiar un mazo a otro
--    compartiendo el repaso: sin ella, copiar falla.
--    `user_id` es lo que miran las políticas de RLS.
select c.tabla, c.columna,
       exists (select 1 from information_schema.columns i
                where i.table_schema = 'public' and i.table_name = c.tabla
                  and i.column_name = c.columna) as existe
from (values ('flashcards', 'grupo_id'), ('flashcards', 'user_id'),
             ('favoritos', 'user_id'), ('mazos_estilo', 'user_id'),
             ('flashcards_progreso', 'user_id')) as c(tabla, columna)
order by existe, c.tabla, c.columna;

-- 3) ¿Qué políticas hay? Una escritura rechazada (código 42501) sale de aquí.
--    Lo que hay que mirar: que cada tabla personal tenga las cuatro
--    (select/insert/update/delete) y que la de insert lleve `auth.uid() =
--    user_id` en el `with check`. Si falta la de insert, guardar es imposible
--    por mucho que la app lo intente.
select tablename as tabla, policyname as politica, cmd as operacion,
       qual as condicion_lectura, with_check as condicion_escritura
from pg_policies
where schemaname = 'public'
  and tablename in ('favoritos', 'flashcards', 'mazos_estilo', 'flashcards_progreso')
order by tablename, cmd, policyname;
