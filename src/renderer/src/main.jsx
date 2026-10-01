import './styles.css'
import App from './App'
import { SettingsProvider } from './context/SettingsContext'
import { createRoot } from 'react-dom/client'

const container = document.getElementById('root')

const ErrorFallback = ({ error }) => (
  <div style={{
    padding: '2rem', background: '#0d0d0d', color: '#ff6b6b',
    fontFamily: 'monospace', minHeight: '100vh'
  }}>
    <h2>App Error</h2>
    <pre style={{ color: '#8e8e93', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
      {error?.message || 'Unknown error'}
    </pre>
    <pre style={{ color: '#555', fontSize: '0.75rem', marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>
      {error?.stack || ''}
    </pre>
  </div>
)

try {
  const root = createRoot(container)
  root.render(
    <SettingsProvider>
      <App />
    </SettingsProvider>
  )
} catch (err) {
  console.error('Fatal render error:', err)
  const root = createRoot(container)
  root.render(<ErrorFallback error={err} />)
}

window.addEventListener('error', (e) => {
  document.body.innerHTML = `<pre style="color:#ff6b6b;padding:2rem;font-family:monospace;background:#0d0d0d;min-height:100vh">${e.error?.stack || e.message}</pre>`
})
