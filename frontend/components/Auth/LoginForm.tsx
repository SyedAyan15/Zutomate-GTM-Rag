'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Mail, Lock, AlertCircle, Loader2 } from 'lucide-react'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Left Side - Hero/Branding */}
      <div className="hidden md:flex flex-1 bg-[#0A192F] items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A192F] to-[#112240] opacity-90"></div>
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-amber-500"></div>
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-orange-500 rounded-full blur-[100px] opacity-10"></div>

        <div className="relative z-10 text-white max-w-lg">
          <h1 className="text-5xl font-bold mb-6 tracking-tight leading-tight text-orange-500">
            Zutomate
          </h1>
          <div className="w-48 h-1 bg-orange-500 mb-8 rounded-full"></div>
          <p className="text-2xl font-light text-gray-300 italic">
            "Your First Go-to Market AI Agent"
          </p>
          <p className="mt-8 text-gray-400 leading-relaxed">
            Experience the power of AI-driven market analysis. Access your knowledge base, generate strategies, and accelerate your growth with precision.
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 md:p-12 lg:p-16">
        <div className="max-w-md w-full space-y-10">
          <div className="text-center md:text-left">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Welcome Back</h2>
            <p className="mt-2 text-sm text-gray-600">
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
                <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Mail className="h-5 w-5" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors bg-white text-gray-900 placeholder-gray-400 shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Lock className="h-5 w-5" />
                  </div>
                  <input
                    id="password"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors bg-white text-gray-900 placeholder-gray-400 shadow-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-orange-500 focus:ring-orange-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-600">
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <a href="#" className="font-medium text-orange-600 hover:text-orange-500 transition-colors">
                  Forgot password?
                </a>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-sm font-bold text-white bg-[#0A192F] hover:bg-[#112240] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0A192F] transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
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
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or continue with</span>
              </div>
            </div>

            <p className="mt-8 text-center text-sm text-gray-600">
              Don't have an account?{' '}
              <a href="/signup" className="font-bold text-orange-600 hover:text-orange-500 transition-colors">
                Sign up now
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

