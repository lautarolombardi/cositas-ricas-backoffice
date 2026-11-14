import { useCallback } from 'react'
import { LoginScreen } from './components/LoginScreen.tsx'
import { ProductsPage } from './features/products/ProductsPage.tsx'
import { useSession } from './session.ts'
import { toast } from 'sonner'
import './App.css'

function App() {
  const { token, login, logout } = useSession()
  const handleUnauthorized = useCallback(() => {
    logout()
    toast.info('Tu sesión expiró. Ingresá de nuevo.')
  }, [logout])

  if (!token) {
    return <LoginScreen onLogin={login} />
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <p className="topbar-brand">
            Cositas <em>Ricas</em>
            <span>Backoffice</span>
          </p>
          <button type="button" className="ghost-button" onClick={logout}>
            Salir
          </button>
        </div>
      </header>

      <ProductsPage token={token} onUnauthorized={handleUnauthorized} />
    </>
  )
}

export default App
