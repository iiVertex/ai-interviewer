import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useAuth } from './lib/auth'
import { supabaseConfigured } from './lib/supabase'
import Consent from './pages/Consent'
import Home from './pages/Home'
import Landing from './pages/Landing'
import NewSession from './pages/NewSession'

// The interview room pulls in MediaPipe (~500 kB), so load it and the report on demand.
const Interview = lazy(() => import('./pages/Interview'))
const Report = lazy(() => import('./pages/Report'))

const fallback = (
  <div className="center-screen">
    <div className="spinner" />
  </div>
)

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return fallback
  if (!session) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const { session, loading } = useAuth()

  if (!supabaseConfigured) {
    return (
      <Layout>
        <div className="card notice">
          <h1>Almost there</h1>
          <p>
            Copy <code>web/.env.example</code> to <code>web/.env.local</code> and fill in your Supabase URL and anon key,
            then restart <code>npm run dev</code>.
          </p>
        </div>
      </Layout>
    )
  }

  return (
    <Suspense fallback={fallback}>
      <Routes>
        <Route path="/" element={loading ? fallback : session ? <Home /> : <Landing />} />
        <Route path="/consent" element={<RequireAuth><Consent /></RequireAuth>} />
        <Route path="/new" element={<RequireAuth><NewSession /></RequireAuth>} />
        <Route path="/session/:id" element={<RequireAuth><Interview /></RequireAuth>} />
        <Route path="/report/:id" element={<RequireAuth><Report /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
