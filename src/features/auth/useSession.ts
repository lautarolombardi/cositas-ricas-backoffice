import { useCallback, useState } from 'react'

const STORAGE_KEY = 'cositas-ricas-backoffice-token'

export function useSession() {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEY))

  const login = useCallback((newToken: string) => {
    localStorage.setItem(STORAGE_KEY, newToken)
    setToken(newToken)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setToken(null)
  }, [])

  return { token, login, logout }
}
