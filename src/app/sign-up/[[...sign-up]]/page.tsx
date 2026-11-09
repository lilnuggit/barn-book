import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LOCAL_DEV_USER_ID } from "@/lib/dev-mode";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  if (LOCAL_DEV_USER_ID) redirect("/");
  return (
    <AuthShell>
      <SignUp path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/" />
    </AuthShell>
  );
}
