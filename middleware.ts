import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/auth/verify-token';

const protectedRoutes = [
  '/dashboard',
  '/news',
  '/sources',
  '/bookmarks',
  '/topics',
  '/chat',
  '/analytics',
  '/settings',
];

const authRoutes = ['/sign-in', '/sign-up'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the route is protected
  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  // If the route is neither protected nor auth, skip verification
  if (!isProtectedRoute && !isAuthRoute) {
    return NextResponse.next();
  }

  // Get session token (supports both http and https cookie variants)
  const token = request.cookies.get('next-auth.session-token')?.value ||
                request.cookies.get('__Secure-next-auth.session-token')?.value;

  const secret = process.env.NEXTAUTH_SECRET;

  // Verify the JWT — rejects expired, tampered, or missing tokens
  const payload = await verifySessionToken(token, secret);
  const isAuthenticated = payload !== null;

  // If not authenticated and trying to access protected route
  if (isProtectedRoute && !isAuthenticated) {
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // If authenticated and trying to access auth route (sign-in/sign-up)
  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|images).*)'],
};
