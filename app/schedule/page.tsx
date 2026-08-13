import { ScheduleForm } from "@/components/ScheduleForm";
import { PlatformConnect } from "@/components/PlatformConnect";
import { Navigation } from "@/components/Navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";

export default function SchedulePage() {
  const [supabase] = useState(() => import("@/lib/supabase").createClient);
  const { toast } = useToast();

  useEffect(() => {
    // Check auth on page load
  }, []);

  const handleSchedule = async (data: {
    content: string;
    platforms: string[];
    media_urls: string[];
    scheduled_at: string;
  }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      toast({
        title: "Error",
        description: "You must be logged in",
        variant: "destructive",
      });
      return;
    }

    const response = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        user_id: session.user.id,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      toast({
        title: "Error",
        description: result.error || "Failed to schedule post",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: `Post ${data.scheduled_at ? "scheduled for " + new Date(data.scheduled_at).toLocaleString() : "queued for immediate posting"}`,
    });
  };

  return (
    <div className="min-h-screen bg-background p-6 md:ml-64">
      <Navigation />

      <main className="prose max-w-2xl">
        <h1 className="mb-6 text-3xl font-bold">Schedule New Post</h1>

        <ScheduleForm
          onSubmit={(data) => handleSchedule(data)}
          userSupabase={supabase}
        />

        <div className="mt-8">
          <h2 className="mb-4 text-xl font-medium">Platform Connections</h2>
          <PlatformConnect />
        </div>
      </main>
    </div>
  );
}