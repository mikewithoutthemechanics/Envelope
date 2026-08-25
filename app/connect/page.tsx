"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";
import { Navigation } from "@/components/Navigation";
import { PlatformConnect } from "@/components/PlatformConnect";

export default function ConnectPage() {
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<any[]>([]);

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }

    const { data, error } = await (supabase as any)
      .from("connections")
      .select("*")
      .eq("user_id", session.user.id);

    if (!error && data) {
      setConnections(data);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading connections...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 md:ml-64">
      <Navigation />

      <main className="prose max-w-2xl">
        <h1 className="mb-6 text-3xl font-bold">Platform Connections</h1>

        <p className="mb-4 text-muted-foreground">
          Connect platforms to schedule and post content. You can connect multiple platforms
          per post.
        </p>

        <PlatformConnect />

        <div className="mt-8 pt-8 border-t">
          <h2 className="mb-4 text-xl font-medium">Connection Status</h2>

          {connections.length > 0 && (
            <div className="space-y-3">
              {connections.map((conn: any) => (
                <div
                  key={conn.id}
                  className="border rounded-lg p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-muted p-2">
                      {/* Platform icon would go here */}
                    </div>
                    <div>
                      <p className="font-medium">{conn.platform}</p>
                      <p className="text-sm text-muted-foreground">
                        {conn.expires_at ? "Expires: " + new Date(conn.expires_at).toLocaleDateString() : "No expiry"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}