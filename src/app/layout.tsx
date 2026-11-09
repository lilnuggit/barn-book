import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { LOCAL_DEV_USER_ID } from "@/lib/dev-mode";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Barn Book", template: "%s · Barn Book" },
  description: "Daily training log for your horses",
  applicationName: "Barn Book",
  appleWebApp: {
    capable: true,
    title: "Barn Book",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2e5546" },
    { media: "(prefers-color-scheme: dark)", color: "#182a22" },
  ],
};

const clerkAppearance = {
  variables: {
    colorPrimary: "#2e5546",
    colorForeground: "#1d1b16",
    colorBackground: "#ffffff",
    borderRadius: "0.75rem",
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "SF Pro Text", sans-serif',
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="antialiased">
        {LOCAL_DEV_USER_ID ? (
          children
        ) : (
          <ClerkProvider appearance={clerkAppearance} signInUrl="/sign-in" signUpUrl="/sign-up" afterSignOutUrl="/sign-in">
            {children}
          </ClerkProvider>
        )}
      </body>
    </html>
  );
}
