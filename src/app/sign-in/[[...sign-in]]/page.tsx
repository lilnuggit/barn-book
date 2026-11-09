import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LOCAL_DEV_USER_ID } from "@/lib/dev-mode";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  if (LOCAL_DEV_USER_ID) redirect("/");
  return (
    <AuthShell>
      <SignIn path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/" />
    </AuthShell>
  );
}
