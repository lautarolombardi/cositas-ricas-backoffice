import { useState } from 'react'
import type { FormEvent } from 'react'
import { login, UnauthorizedError } from '../../api.ts'
import { toast } from 'sonner'

interface LoginScreenProps {
  onLogin: (token: string) => void
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    try {
      onLogin(await login(password))
    } catch (caught) {
      toast.error(
        caught instanceof UnauthorizedError
          ? 'Contraseña incorrecta.'
          : 'No pudimos conectar con el servidor. Probá de nuevo.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>
          Cositas <em>Ricas</em>
        </h1>
        <p className="login-subtitle">Backoffice</p>

        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <button
          type="submit"
          className="primary-button"
          disabled={submitting || !password}
        >
          {submitting ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  )
}
