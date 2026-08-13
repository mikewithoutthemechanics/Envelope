import { useState, useEffect } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ExternalLink, Twitter, Instagram, Music, PlaySquare } from "lucide-react";
import type { PlatformConnection, Platform } from "@/types";

const PLATFORM_CONFIG: Record<Platform, { icon: React.ElementType; name: string }> = {
  twitter: { icon: Twitter, name: "X / Twitter" },
  instagram: { icon: Instagram, name: "Instagram" },
  tiktok: { icon: Music, name: "TikTok" },
  youtube: { icon: PlaySquare, name: "YouTube" },
};

export function PlatformConnect() {
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [supabase] = useState(() => createBrowserSupabaseClient());

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("connections")
      .select("*")
      .eq("user_id", session.user.id);

    if (!error && data) setConnections(data);
    setLoading(false);
  };

  const connectPlatform = async (platform: Platform) => {
    setConnectingPlatform(platform);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      const response = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, user_id: session.user.id }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to connect");
      }

      if (result.auth_url) {
        window.open(result.auth_url, "_blank", "width=600,height=700");
      }
    } catch (error) {
      console.error("Connection error:", error);
    } finally {
      setConnectingPlatform(null);
    }
  };

  const isConnected = (platform: Platform) =>
    connections.some((c) => c.platform === platform);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform Connections</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading connections...</p>
        ) : (
          <>
            {Object.entries(PLATFORM_CONFIG).map(([key, config]) => {
              const Icon = config.icon;
              const platform = key as Platform;
              const connected = isConnected(platform);
              const connection = connections.find((c) => c.platform === platform);

              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-muted p-2">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{config.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {connected
                          ? `Connected`
                          : "Not connected"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {connected && (
                      <Badge variant="default" className="bg-green-500">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Connected
                      </Badge>
                    )}
                    {!connected && (
                      <Button
                        size="sm"
                        onClick={() => connectPlatform(platform)}
                        disabled={!!connectingPlatform}
                      >
                        {connectingPlatform === platform ? "Connecting..." : "Connect"}
                      </Button>
                    )}
                    {connected && connection?.access_token && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => connectPlatform(platform)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        <div className="pt-4 text-center">
          <p className="text-sm text-muted-foreground">
            Connect platforms to start scheduling posts. You can connect multiple platforms
            per post.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export const PlatformConnectIcon = Twitter;
