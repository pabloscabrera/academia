import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Le dice a la red de seguridad de index.html que el JavaScript sí arrancó.
window.__autopirArranco = true

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
