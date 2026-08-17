// frontend/src/lib/theme.ts
export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'theme_preference'

export function getEffectiveIsDark(preference: ThemePreference): boolean {
  if (preference === 'dark') return true
  if (preference === 'light') return false
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
}

// Applies the class AND caches the preference locally. The cache is only a
// performance aid so index.html can guess correctly before React ever loads
// — the account's saved value on the backend is still the source of truth.
export function applyTheme(preference: ThemePreference) {
  document.documentElement.classList.toggle('dark', getEffectiveIsDark(preference))
  try { localStorage.setItem(STORAGE_KEY, preference) } catch {}
}

export function getCachedPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {}
  return 'system'
}

// While preference is 'system', keeps following the OS if it changes while
// the app is open, instead of only checking once at load.
let listenerAttached = false
export function watchSystemTheme(getCurrentPreference: () => ThemePreference) {
  if (listenerAttached || !window.matchMedia) return
  listenerAttached = true
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getCurrentPreference() === 'system') applyTheme('system')
  })
}