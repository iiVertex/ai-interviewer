import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { BrandMark } from './BrandMark'
import { ThemeToggle } from './ThemeToggle'

export function Layout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { session, signOut } = useAuth()
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <BrandMark />
          <span>Interview Coach</span>
        </Link>
        {session && (
          <nav className="topbar__links" aria-label="Main">
            <NavLink to="/" end className="topbar__link">Sessions</NavLink>
            <button className="topbar__link" onClick={signOut}>Sign out</button>
          </nav>
        )}
        <div className="topbar__end">
          <ThemeToggle />
          {session && <Link to="/new" className="topbar__cta">New session</Link>}
        </div>
      </header>
      <main className={wide ? 'page page--wide' : 'page'}>{children}</main>
    </div>
  )
}
