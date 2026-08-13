import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BarChart3, Calendar, LayoutDashboard, LogOut, Settings, Users } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Schedule", href: "/schedule", icon: Calendar },
  { name: "Connections", href: "/connect", icon: Users },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Navigation() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <nav className="flex h-screen flex-col w-64 bg-card border-r p-4">
      <div className="mb-8">
        <h1 className="text-xl font-bold">SocialClaw</h1>
        <p className="text-sm text-muted-foreground">Social Media Scheduler</p>
      </div>

      <div className="space-y-1 flex-1">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                isActive ? "bg-accent text-accent-foreground" : "transparent"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </div>

      {user && (
        <div className="border-t pt-4">
          <div className="flex items-center gap-3 px-3 py-2 text-sm">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.full_name ?? user.email}
                className="h-8 w-8 rounded-full"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                {user.email?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 truncate">{user.email}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={signOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      )}
    </nav>
  );
}
