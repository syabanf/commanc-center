import { PEOPLE, can as roleCan } from '@gpi/fixtures'
import type { Permission, Person } from '@gpi/types'
import { type ReactNode, createContext, use, useMemo } from 'react'
import { usePersistentState } from '../lib/storage'

interface Auth {
  user: Person
  /** Demo only: the prototype has no sign-in, so the header lets reviewers view the console as each role. */
  switchUser: (id: string) => void
  can: (permission: Permission) => boolean
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = usePersistentState('gpi.admin.user', 'pe-op1')
  const value = useMemo<Auth>(() => {
    const user = PEOPLE.find((p) => p.id === userId) ?? PEOPLE[0]!
    return { user, switchUser: setUserId, can: (permission) => roleCan(user.role, permission) }
  }, [userId, setUserId])
  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): Auth {
  const auth = use(AuthContext)
  if (!auth) throw new Error('useAuth needs AuthProvider')
  return auth
}
