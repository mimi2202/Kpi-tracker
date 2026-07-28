// frontend/src/store/authStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  full_name: string
  role: string
  organisation?: string
  organisation_name?: string
  organisation_id?: string
  avatar?: string | null
}

interface AuthState {
  token: string | null
  refresh: string | null
  user: User | null
  hasHydrated: boolean
  setAuth: (token: string, refresh: string | null, user: User) => void
  setUser: (user: User) => void
  logout: () => void
  setHasHydrated: (v: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refresh: null,
      user: null,
      hasHydrated: false,
      // Three args, matching the call in LoginPage: setAuth(access, refresh, user)
      setAuth: (token, refresh, user) => set({ token, refresh, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, refresh: null, user: null }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'ips-auth',
      // Persist only real state; hasHydrated is a runtime flag, not persisted.
      partialize: (state) => ({ token: state.token, refresh: state.refresh, user: state.user }),
      // Flip hasHydrated true the moment rehydration from localStorage completes.
      onRehydrateStorage: () => (state) => { if (state) state.setHasHydrated(true) },
    }
  )
)