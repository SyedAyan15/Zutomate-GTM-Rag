'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Mail, Lock, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    setMounted(true)
  }, [])


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('🔵 Login started')
    setLoading(true)
    setError(null)

    try {
      console.log('🔵 Checking Supabase URL...')
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl) {
        console.log('❌ Supabase URL not found')
        setError('Supabase URL is not configured. Please check your environment variables.')
        setLoading(false)
        return
      }
      console.log('✅ Supabase URL found:', supabaseUrl)

      console.log('🔵 Attempting sign in with:', email)
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      console.log('🔵 Sign in response:', { data, error: signInError })

      if (signInError) {
        console.log('❌ Sign in error:', signInError)
        let errorMessage = signInError.message || 'An error occurred during login. Please try again.'

        // Provide helpful message for email confirmation error
        if (signInError.message?.toLowerCase().includes('email not confirmed') ||
          signInError.message?.toLowerCase().includes('email_not_confirmed') ||
          signInError.message?.toLowerCase().includes('confirm your email')) {
          errorMessage = 'Please confirm your email to verify your account.'
        }

        setError(errorMessage)
        setLoading(false)
        return
      }

      if (data.user && data.session) {
        console.log('✅ Sign in successful!')
        window.location.href = '/dashboard'
      } else {
        console.log('❌ No user or session in response')
        setError('Login failed. Please try again.')
        setLoading(false)
      }
    } catch (err: any) {
      console.error('❌ Login error:', err)
      setError(
        err.message ||
        'Failed to connect to the server. Please check your internet connection and try again.'
      )
      setLoading(false)
    }
  }

  if (!mounted) {
    return null
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-transparent">
      {/* Left Side - Hero/Branding (Stacked on Mobile) */}
      <div className="flex w-full md:flex-1 bg-[var(--navy-card)] border-r border-[var(--border)] items-center justify-center p-8 md:p-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-[var(--orange)]"></div>

        <div className="relative z-10 text-[var(--white)] w-full max-w-sm text-center flex flex-col items-center">
          <img
            src="/zutomate-logo-transparent.svg"
            alt="Zutomate"
            className="mb-8 w-56 md:w-72 mx-auto"
          />
          <p className="text-lg md:text-2xl font-bold text-[var(--orange)] italic">
            Your First Go-to Market AI Agent
          </p>
          <p className="hidden md:block mt-8 text-[var(--muted)] leading-relaxed">
            Experience the power of AI-driven market analysis. Access your knowledge base, generate strategies, and accelerate your growth with precision.
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 md:p-12 lg:p-16">
        <div className="max-w-md w-full space-y-10">
          <div className="text-center md:text-left">
            <h2 className="text-[var(--white)] tracking-tight">Welcome Back</h2>
            <p className="mt-2 text-sm text-[var(--muted)] font-medium">
              Please sign in to your account
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-md">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-[var(--off)] mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--muted)]">
                    <Mail className="h-5 w-5" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field block w-full !pl-10"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-[var(--off)] mb-1">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--muted)]">
                    <Lock className="h-5 w-5" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field block w-full !pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--muted)] hover:text-[var(--white)] focus:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 bg-[var(--navy-card)] border-[var(--border)] rounded accent-[var(--orange)]"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-[var(--muted)]">
                  Remember me
                </label>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary flex justify-center items-center py-3 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center">
                    <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
                    Signing in...
                  </span>
                ) : (
                  'Sign In'
                )}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <p className="mt-8 text-center text-sm text-[var(--muted)]">
              Don't have an account?{' '}
              <a href="/signup" className="font-bold text-[var(--orange)] hover:text-[var(--orange-dim)] transition-colors">
                Sign up now
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

