#!/usr/bin/env python3
"""Comprueba que cada pregunta del banco está archivada en el examen correcto.

    python3 herramientas/verificar-examenes.py  cuaderno-2020.pdf=PIR20  [...]

Compara los ficheros `supabase-pir*-preguntas.sql` del repositorio contra los
cuadernos OFICIALES del Ministerio en PDF. Necesita `pdftotext` (poppler).

POR QUÉ EXISTE. El banco tenía 25 preguntas del examen de 2024 archivadas como
PIR 20. Se descubrió de rebote, porque una salía repetida en la app, y antes de
eso se dio por buena la explicación cómoda de que "el PIR repite preguntas".
Esto convierte esa comprobación en algo que se puede repetir con cada examen
nuevo en vez de depender de que alguien se dé cuenta.

CÓMO DECIDE, y por qué así. Se compara por secuencias de SEIS palabras
consecutivas, y una pregunta se da por encontrada solo si:
  * coincide el 70% o más de sus secuencias, Y
  * en los demás cuadernos coincide al menos un 40% menos.
La segunda condición es la que importa: el vocabulario de la psicología es
común a todos los exámenes y siempre hay un 20-30% de coincidencia de fondo.
Asignar por eso sería asignar por parecido.

DOS TRAMPAS QUE YA COSTARON UN RESULTADO FALSO:
  1. Un enunciado corto NO se puede juzgar. "En la bulimia nerviosa:" o "El
     sueño REM:" aparecen literalmente en casi cualquier cuaderno. Una versión
     anterior los buscaba como frase suelta y daba por contaminadas preguntas
     que no lo estaban. Ahora, si el enunciado no llega a 14 palabras, se le
     añaden sus opciones; y si aun así no da, se declara NO CONCLUYENTE.
  2. Sumarle las opciones a TODAS las preguntas empeora el resultado: una
     errata en una opción tumba la cobertura y se pierden coincidencias
     buenas. Por eso las opciones son el último recurso y no el criterio.

El PDF va a dos columnas y el punto de corte VARÍA entre páginas, así que se
prueban varios cortes y se unen las secuencias: para el corte bueno cada
columna sale limpia, y los malos solo añaden ruido que no coincide con nada.

Lo que esta herramienta NO hace: decir que una pregunta está bien archivada.
Solo detecta que aparece en OTRO cuaderno de los que se le den. Para confirmar
que una pregunta de PIR 18 es de 2018 hace falta el cuaderno de 2018.
"""
import io, os, re, sys, json, glob, subprocess, unicodedata

N = 6
MIN_COBERTURA = 0.70
MIN_DIFERENCIA = 0.40
MIN_PALABRAS = 14

def palabras(s):
    s = s.replace("’", "'").replace("“", '"').replace("”", '"')
    s = re.sub(r"-\s*\n\s*", "", s)          # guion de corte de línea
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).split()

def gramas(ws):
    return {" ".join(ws[i:i + N]) for i in range(len(ws) - N + 1)}

def indice_pdf(ruta_pdf):
    txt = subprocess.run(["pdftotext", "-layout", ruta_pdf, "-"],
                         capture_output=True, text=True).stdout
    g = set()
    for corte in range(56, 80, 2):
        for lado in (0, 1):
            trozos = []
            for pagina in txt.split("\f"):
                ls = pagina.split("\n")
                trozos.append("\n".join(l[:corte] if lado == 0 else l[corte:] for l in ls))
            g |= gramas(palabras("\n".join(trozos)))
    return g

def cobertura(texto, idx):
    ws = palabras(texto)
    if len(ws) < N + 2: return 0.0
    gs = gramas(ws)
    return sum(1 for x in gs if x in idx) / len(gs)

def veredicto(enun, completo, idx):
    texto = enun if len(palabras(enun)) >= MIN_PALABRAS else completo
    if len(palabras(texto)) < MIN_PALABRAS: return None, "enunciado corto"
    c = {a: cobertura(texto, i) for a, i in idx.items()}
    mejor = max(c, key=c.get)
    otro = max([x for a, x in c.items() if a != mejor], default=0.0)
    if c[mejor] >= MIN_COBERTURA and c[mejor] - otro >= MIN_DIFERENCIA:
        return mejor, round(c[mejor], 2)
    return None, "no concluyente"

def filas_sql(ruta):
    sql = io.open(ruta, encoding="utf-8").read()
    pat = re.compile(r"\('(PIR \d+)', '((?:[^']|'')*)', '((?:[^']|'')*)', '(\[.*?\])'::jsonb", re.S)
    for m in pat.finditer(sql):
        curso, _tema, enun, opc = m.groups()
        e = enun.replace("''", "'")
        try: ops = " ".join(json.loads(opc.replace("''", "'")))
        except Exception: ops = ""
        yield curso, e, e + " " + ops

def main(args):
    if not args:
        print(__doc__); return 1
    idx = {}
    for a in args:
        pdf, _, etiqueta = a.partition("=")
        if not etiqueta or not os.path.exists(pdf):
            print(f"uso: cuaderno.pdf=ETIQUETA   (no vale {a!r})"); return 1
        print(f"leyendo {pdf} como {etiqueta}...")
        idx[etiqueta] = indice_pdf(pdf)

    raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    print(f"\n{'fichero':<9}{'filas':>6}{'encajan':>9}{'EN OTRO':>9}{'sin ver':>9}")
    print("-" * 42)
    avisos = []
    for ruta in sorted(glob.glob(os.path.join(raiz, "supabase-pir*-preguntas.sql"))):
        nom = os.path.basename(ruta).replace("supabase-", "").replace("-preguntas.sql", "").upper()
        bien = fuera = sinver = 0
        for curso, enun, completo in filas_sql(ruta):
            a, m = veredicto(enun, completo, idx)
            if a is None: sinver += 1
            elif a.upper().endswith(curso[-2:]): bien += 1
            else:
                fuera += 1
                avisos.append((nom, a, m, enun))
        print(f"{nom:<9}{bien+fuera+sinver:>6}{bien:>9}{fuera:>9}{sinver:>9}")
    if avisos:
        print("\nPREGUNTAS QUE APARECEN EN UN CUADERNO QUE NO ES EL SUYO:")
        for nom, a, m, e in avisos:
            print(f"  {nom} -> {a} (cobertura {m}): {e[:95]}")
    else:
        print("\nNinguna pregunta aparece en un cuaderno que no sea el suyo.")
    print("\nAviso: 'sin ver' no significa que esté mal, sino que no se puede")
    print("juzgar con los cuadernos dados. Hace falta el del año que le toca.")
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
