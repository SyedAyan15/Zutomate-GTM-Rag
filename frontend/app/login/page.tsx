export const dynamic = 'force-dynamic'

import LoginForm from '@/components/Auth/LoginForm'

export default function LoginPage() {
  return (
    <div suppressHydrationWarning>
      <LoginForm />
    </div>
  )
}

