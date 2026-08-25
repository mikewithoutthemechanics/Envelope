import "./globals.css";
import { AuthProvider } from "@/context/auth-context";

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
      </body>
    </html>
  );
}