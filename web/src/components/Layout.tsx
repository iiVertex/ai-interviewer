import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export function Layout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { session, signOut } = useAuth()
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>Interview Coach</span>
        </Link>
        {session && (
          <nav className="topbar__nav">
            <Link to="/new" className="btn btn--primary btn--sm">New session</Link>
            <button className="btn btn--ghost btn--sm" onClick={signOut}>Sign out</button>
          </nav>
        )}
      </header>
      <main className={wide ? 'page page--wide' : 'page'}>{children}</main>
    </div>
  )
}
