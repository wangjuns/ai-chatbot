import NextAuth from 'next-auth'
import { authConfig } from './auth.config'
import { NextResponse } from 'next/server'

const auth = NextAuth(authConfig).auth

export default auth((req) => {
  const session = req.auth
  if (!session && !req.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)']
}
