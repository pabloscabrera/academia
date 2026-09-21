-- Ejecutar una sola vez en Supabase (Dashboard → SQL Editor → New query → Run).
--
-- Permite que una misma tarjeta "lógica" exista copiada en varios mazos a la
-- vez, compartiendo el mismo progreso de repaso SM-2 en todas sus copias —
-- pedido explícito del usuario: "QUIERO CREAR UN NUEVO MAZO EN FLASHCARDS Y
-- LUEGO AÑADIRLO TAMBIEN DIRECTAMENTE A UNO YA EXISTENTE (PARA TENER EL
-- NUEVO CONTENIDO SEPARADO Y MEZCLADO CON EL ANTERIOR PARA REPASAR) [...]
-- (Y SE ACUERDE DEL FEEDBACK QUE LE HE DADO EN CUALQUIER CARPETA)".
--
-- CÓMO: en vez de rediseñar `mazo` como un array (lo que obligaría a
-- reescribir toda la lógica ya construida del explorador de carpetas —
-- arbolCarpetas/statsPorMazo/statsDeCarpeta/renombrarMazo/eliminarMazo,
-- todas basadas en "una fila = un mazo"), cada copia de una tarjeta sigue
-- siendo su propia fila normal en `flashcards` (una por mazo), pero todas
-- las copias de la misma tarjeta comparten un `grupo_id`. El repaso ya no
-- se guarda por `flashcard_id` = id de la fila, sino por `grupo_id` (o el
-- propio id si la tarjeta no tiene copias) — así estudiar/valorar la
-- tarjeta desde cualquiera de sus mazos actualiza el mismo progreso.
--
-- Para las tarjetas ya existentes (una sola copia cada una), grupo_id se
-- rellena con su propio id: no hay ningún cambio de comportamiento para
-- ellas, ya que flashcards_progreso.flashcard_id ya apuntaba a ese mismo
-- valor.
--
-- IMPORTANTE: flashcards_progreso.flashcard_id tenía una FK a
-- flashcards(id) on delete cascade. Como grupo_id NO es único por fila
-- (varias copias comparten el mismo valor), no puede seguir siendo una FK a
-- flashcards(id) — se elimina esa restricción; el borrado en cascada de
-- flashcards_progreso al borrar la última copia de un grupo pasa a
-- gestionarse a mano desde deleteFlashcard/eliminarMazo en App.jsx.

alter table public.flashcards add column if not exists grupo_id uuid;
update public.flashcards set grupo_id = id where grupo_id is null;
alter table public.flashcards alter column grupo_id set not null;
alter table public.flashcards alter column grupo_id set default gen_random_uuid();

alter table public.flashcards_progreso drop constraint if exists flashcards_progreso_flashcard_id_fkey;

-- Comprobación: debería devolver 0 filas (todas las tarjetas ya tienen grupo_id).
select count(*) as sin_grupo from public.flashcards where grupo_id is null;
