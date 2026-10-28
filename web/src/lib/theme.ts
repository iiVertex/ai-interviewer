import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'theme'

function saved(): Theme | null {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : null
  } catch {
    return null
  }
}

/** Swap the theme with every transition off, so colors don't all animate at once. */
function apply(theme: Theme) {
  const style = document.createElement('style')
  // The toggle's own icons keep their cross-fade.
  style.append(document.createTextNode('*:not(.theme-toggle__icon),*::before,*::after{transition:none !important}'))
  document.head.append(style)
  document.documentElement.dataset.theme = theme
  void document.body.offsetHeight // commit the new colors while transitions are off
  requestAnimationFrame(() => requestAnimationFrame(() => style.remove()))
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'))

  // Follow the system setting until the person picks a theme themselves.
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (saved()) return
      const next: Theme = mql.matches ? 'dark' : 'light'
      apply(next)
      setTheme(next)
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // Private mode or blocked storage: the switch still works for this visit.
    }
    apply(next)
    setTheme(next)
  }

  return { theme, toggle }
}
