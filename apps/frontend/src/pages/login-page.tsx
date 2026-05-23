import { useState, type FormEvent } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { isAuthenticatedAtom } from '../stores/auth'
import { useLogin } from '../queries'

export function LoginPage() {
  const isAuth = useAtomValue(isAuthenticatedAtom)
  const loginMutation = useLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (isAuth) return <Navigate to="/" />

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    loginMutation.mutate({ email, password })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cloud">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl bg-canvas p-8 shadow-lg">
        <h1 className="mb-6 text-center text-2xl font-bold">Sign In</h1>

        {loginMutation.isError && (
          <div className="mb-4 rounded-lg bg-primary-soft p-3 text-sm text-error">
            {loginMutation.error?.message || 'Login failed'}
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-charcoal">Email</label>
          <input
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-steel px-3 py-2 text-sm outline-none focus:border-primary"
            placeholder="user-a1@example.com"
            required
          />
        </div>

        <div className="mb-6">
          <label className="mb-1 block text-sm font-medium text-charcoal">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-steel px-3 py-2 text-sm outline-none focus:border-primary"
            placeholder="password123"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-white hover:bg-primary-deep disabled:opacity-50"
        >
          {loginMutation.isPending ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  )
}
