# Cómo volver atrás si un paso la lía

Cada cambio entra en `main` por un PR aplastado en **un solo commit**, así que cada
PR es un punto de restauración. La lista, siempre al día:

    herramientas/puntos-de-restauracion.sh        # los últimos 30; admite otro número

Sale `PR #213  3acba9038b48  2026-11-26  título`. Ese SHA es el que se usa abajo.

**Nada de esto reescribe la historia ni usa `--force`**: deshacer es un commit nuevo
que se fusiona por PR como cualquier otro, y el paso malo sigue en el historial por
si hace falta volver a verlo.

## A) Deshacer el último paso (o uno reciente y aislado)

    git switch -c deshacer/pr-213 origin/main
    git revert --no-commit 3acba9038b48      # el SHA del PR a deshacer
    npm test && npm run build                # que lo que queda funcione
    git commit -m "Deshacer PR 213"          # y se sube y se fusiona por PR

Con el más reciente sale limpio (comprobado con el PR 213). Con uno **antiguo** puede
dar conflicto, normalmente en `CLAUDE.md`, porque los pasos posteriores tocaron el
mismo fichero (comprobado con el PR 210). Si pasa, usa el método B.

## B) Volver TODO el árbol al estado de un punto (siempre funciona)

    git switch -c volver/pr-204 origin/main
    git read-tree -u --reset 8a453ab62be5    # el SHA del PR al que se quiere volver
    npm test && npm run build
    git commit -m "Volver al estado del PR 204"

`read-tree -u --reset` deja el árbol **idéntico** al del punto, **borrando también los
ficheros que se añadieron después** (comprobado: 0 diferencias con el punto, y el
`CLAUDE.md` y los hooks de después desaparecen con él). Es más tosco que A: se lleva
por delante TODO lo posterior, no solo un paso. Úsalo cuando A no sirve o cuando se
quiere "volver a como estaba el martes".

## C) La web en producción, sin esperar a un PR

Vercel conserva los despliegues anteriores; desde su panel (Deployments) se puede
volver a uno anterior en un clic, sin tocar git. **No lo he podido comprobar desde
aquí** (no tengo acceso al panel): conviene probarlo una vez con calma antes de
necesitarlo.

## D) Lo que NO está en git: la base de datos

Un PR se deshace; **un `update` o `delete` en Supabase, no**. Regla antes de cualquier
cambio de datos que toque filas ya existentes (nunca con las flashcards ni el progreso
de nadie sin avisar):

    create table public.respaldo_20261126_pir20 as
      select * from public.preguntas where curso = 'PIR 20';   -- las filas que se van a tocar

Se hace en el mismo bloque que el cambio, y se apunta el nombre de la tabla en el PR.
Para devolver las filas: `insert into public.preguntas select * from public.respaldo_...`
(o un `update` desde ella). Las tablas `respaldo_*` se borran cuando se confirme que el
cambio fue bien, no antes. **Los ficheros `supabase-*.sql` del repo son el registro de lo
que se ejecutó, no una copia de seguridad de lo que había.**
