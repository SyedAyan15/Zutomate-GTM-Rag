import { redirect } from 'next/navigation'

export default async function Home() {
  // Always go to dashboard; dashboard handles its own auth check
  redirect('/dashboard')
}
