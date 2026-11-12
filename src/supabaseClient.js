import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://slwifwjwtipoqtkhbhbr.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsd2lmd2p3dGlwb3F0a2hiaGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NjA0OTcsImV4cCI6MjEwNDUzNjQ5N30.1doJMfmoNSSl5L6bPWrjVSfwWATewbpKlZIBl3u33EM'

// Ninguna lectura puede servirse de una copia guardada por el navegador.
//
// PostgREST **no manda `Cache-Control`** en sus respuestas, y un navegador que
// recibe un GET sin esa cabecera puede decidir por su cuenta cuánto tiempo la
// da por buena. En Safari —y sobre todo en la app del icono de la pantalla de
// inicio, que tiene su propia caché— eso significa que la lista de flashcards
// puede venir de una respuesta vieja: importas un mazo, lo ves en Safari, y
// desde el icono sigue sin aparecer aunque la cuenta sea la misma y el código
// esté al día. Síntoma real, y costó una tarde.
//
// `cache: "no-store"` va en las OPCIONES de fetch y no en una cabecera a
// propósito: `Cache-Control` no está en la lista segura de CORS, así que
// mandarlo obligaría a que Supabase lo permitiera en `Access-Control-Allow-Headers`
// y, si no lo permitiera, fallarían TODAS las peticiones. Esto es solo del lado
// del cliente, así que no puede romper nada en el servidor.
//
// Y NO se añade un parámetro a la URL para saltarse la caché, que es el truco
// de siempre: PostgREST interpreta cualquier parámetro desconocido como un
// filtro por una columna con ese nombre, así que `?_=123` devolvería un 400.
const sinCache = (url, opciones = {}) => fetch(url, { ...opciones, cache: 'no-store' })

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { fetch: sinCache },
})
