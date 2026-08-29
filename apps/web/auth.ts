import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@finance-app/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  session: { strategy: "database" },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      // Every auth user gets a 1:1 app profile row with sensible defaults;
      // onboarding lets them override currency/locale/timezone afterward.
      await prisma.appUser.create({
        data: { id: user.id! },
      });
    },
  },
  pages: {
    signIn: "/sign-in",
  },
});
