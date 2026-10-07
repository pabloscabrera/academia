import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// El bundle sale con nombre FIJO (`assets/app.js`), sin el hash que pone Vite
// por defecto. No es un capricho de estilo: es lo que mata la pantalla en
// blanco del icono de la pantalla de inicio. iOS guarda su propia copia del
// `index.html` al añadir el icono y no la refresca sola, así que tras un
// despliegue esa copia pedía `index-<hash viejo>.js`, que ya no existe — el
// módulo no cargaba, React no montaba y no se veía ni un error.
//
// Con un nombre fijo, un `index.html` viejo pide un fichero que SIEMPRE existe
// y que además trae el código de hoy. La contrapartida es que ya no se puede
// cachear para siempre: `vercel.json` le pone `must-revalidate`, así que cada
// arranque pregunta y normalmente recibe un 304 de nada.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
