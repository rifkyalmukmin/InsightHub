import { NextAuthOptions } from 'next-auth';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import prisma from '@/lib/db/prisma';
import { assertSecureAuthSecret } from '@/lib/utils/env';

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
    async jwt({ token, user, account }: { token: any; user: any; account: any }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      // OAuth providers use provider IDs as sub — sync Prisma user ID after upsert
      if (
        account &&
        (account.provider === 'google' || account.provider === 'github') &&
        token.email
      ) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email as string },
          select: { id: true, role: true },
        });
        if (dbUser) {
          token.sub = dbUser.id;
          token.id = dbUser.id;
          token.role = dbUser.role;
        }
      }

      if (!token.role && token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { role: true },
        });
        token.role = dbUser?.role ?? 'user';
      }
      return token;
    },
    async signIn({ user, account }: { user: any; account: any }) {
      if (account?.provider === 'google' || account?.provider === 'github') {
        const dbUser = await prisma.user.upsert({
          where: { email: user.email || '' },
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
