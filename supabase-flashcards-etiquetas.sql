-- Ya ejecutado por el usuario en Supabase (Dashboard → SQL Editor). Se
-- guarda aquí solo como registro, igual que el resto de supabase-*.sql.
--
-- Añade etiquetas libres por tarjeta. Son transversales al mazo: la misma
-- etiqueta ("porcentajes", "DSM-5"...) puede estar en tarjetas de mazos
-- distintos, y en la app sirven para estrechar el repaso a un tema concreto
-- sin importar dónde viva cada tarjeta (ver el filtro de chips en
-- `Flashcards` y `parsearEtiquetas` en App.jsx).
--
-- Se modela como text[] en la propia fila (no una tabla aparte de
-- etiquetas + tabla puente): son pocas por tarjeta, siempre se leen junto
-- con la tarjeta, y el índice GIN ya permite filtrar por "contiene esta
-- etiqueta" sin joins. El `not null default '{}'` evita tener que
-- distinguir entre "sin etiquetas" y null al leerlas.

alter table flashcards
  add column if not exists etiquetas text[] not null default '{}';

create index if not exists flashcards_etiquetas_idx
  on flashcards using gin (etiquetas);
