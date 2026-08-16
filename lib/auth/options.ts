import { NextAuthOptions } from 'next-auth';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import prisma from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { assertSecureAuthSecret } from '@/lib/utils/env';
import type { JWT } from 'next-auth/jwt';
import { resolveJwtToken, type JwtResolveParams } from '@/lib/auth/jwt';

// Fail fast if NEXTAUTH_SECRET is missing or a known default value.
assertSecureAuthSecret();

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.password) {
          return null;
        }

        const isPasswordValid = await compare(
          credentials.password as string,
          user.password
        );

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/sign-in',
  },
  callbacks: {
    async session({ session, token }: { session: any; token: any }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? token.sub;
        session.user.role = token.role ?? 'user';
      }
      return session;
    },
    async jwt(params) {
      // Never lets a provider id or a deleted-user id reach the session (see
      // lib/auth/jwt.ts). Returning null is how the session route invalidates
      // a token (it clears the cookie and returns an empty session), turning
      // the previous opaque FK 500s on writes into a clean 401. next-auth's
      // types omit `null`, so it is cast at this boundary.
      return resolveJwtToken(params as JwtResolveParams) as Promise<JWT>;
    },
    async signIn({ user, account }: { user: any; account: any }) {
      if (account?.provider === 'google' || account?.provider === 'github') {
        // Email is the unique key for accounts — without it the user row would
        // be created with a null email that the jwt callback can never resolve
        // back to, leaking the provider id into the session. Reject instead.
        if (!user.email) {
          logger.warn({ provider: account.provider }, 'OAuth sign-in rejected: no email');
          return false;
        }
        const dbUser = await prisma.user.upsert({
          where: { email: user.email },
          create: {
            email: user.email,
            name: user.name,
            image: user.image,
            emailVerified: new Date(),
          },
          update: {
            name: user.name,
            image: user.image,
          },
        });
        user.id = dbUser.id;
        user.role = dbUser.role;
      }
      return true;
    },
  },
};
