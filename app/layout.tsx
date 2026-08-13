import "./globals.css";
import { AuthProvider } from "@/context/auth-context";
import { NextMenu } from "next/navigation";
import { Songbook } from "lucide-react";

export const metadata = {
  title: "SocialClaw - Social Media Scheduler",
  description: "Schedule and post to X, Instagram, TikTok, and YouTube",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-background font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
        <NextMenu />
      </body>
    </html>
  );
}