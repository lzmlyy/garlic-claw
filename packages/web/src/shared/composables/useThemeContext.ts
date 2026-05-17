import { inject } from 'vue'
import { THEME_CONTEXT_KEY } from '@/shared/providers/theme-context'
import type { ThemeContextValue } from '@/shared/providers/theme-context'

export function useThemeContext(): ThemeContextValue {
  const ctx = inject(THEME_CONTEXT_KEY)
  if (!ctx) {
    throw new Error('useThemeContext() must be used within a <ThemeProvider>')
  }
  return ctx
}
