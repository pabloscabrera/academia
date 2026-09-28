import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Le dice a la red de seguridad de index.html que el JavaScript sí arrancó.
window.__autopirArranco = true

// Sin esto, cualquier fallo al dibujar desmonta el árbol entero y deja la
// pantalla vacía: por fuera, "la app no va", sin una sola pista de por qué.
// Averiguarlo desde un iPad, sin consola, es imposible. Así que el error se
// enseña en pantalla, que es el único sitio donde se puede leer.
class Salvavidas extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('AUTOPIR se rompió:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    const err = this.state.error
    const detalle = [err && err.message, err && err.stack]
      .filter(Boolean)
      .join('\n')
      .split('\n')
      .slice(0, 6)
      .join('\n')

    return (
      <div style={{
        minHeight: '100vh', background: '#EEECE4', color: '#1E1C18', padding: '40px 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', boxSizing: 'border-box',
      }}>
        <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', color: '#A6362B', margin: '0 0 10px', fontSize: 24 }}>
          Algo se ha roto
        </h2>
        <p style={{ color: '#6E6A61', fontSize: 15, lineHeight: 1.55, margin: '0 0 18px' }}>
          Hazle una captura a esto y mándasela a Pablo. Es justo lo que hace falta para arreglarlo.
        </p>
        <pre style={{
          background: '#F6F4EC', border: '1.5px solid #C9C5B7', borderRadius: 12, padding: 16,
          fontSize: 12.5, lineHeight: 1.5, color: '#1E1C18', whiteSpace: 'pre-wrap',
          wordBreak: 'break-word', margin: '0 0 20px', fontFamily: 'ui-monospace, Menlo, monospace',
        }}>{detalle || 'Error desconocido'}</pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            background: '#A6362B', color: '#fff', border: 'none', borderRadius: 12,
            padding: '13px 22px', fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Recargar
        </button>
      </div>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Salvavidas>
      <App />
    </Salvavidas>
  </React.StrictMode>,
)
