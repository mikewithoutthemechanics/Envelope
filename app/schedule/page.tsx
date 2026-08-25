"use client";

import { ScheduleForm } from "@/components/ScheduleForm";
import { PlatformConnect } from "@/components/PlatformConnect";
import { Navigation } from "@/components/Navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function SchedulePage() {
  const { toast } = useToast();

  useEffect(() => {
    // Check auth on page load
  }, []);

  return (
    <div className="min-h-screen bg-background p-6 md:ml-64">
      <Navigation />

      <main className="prose max-w-2xl">
        <h1 className="mb-6 text-3xl font-bold">Schedule New Post</h1>

        <ScheduleForm />

        <div className="mt-8">
          <h2 className="mb-4 text-xl font-medium">Platform Connections</h2>
          <PlatformConnect />
        </div>
      </main>
    </div>
  );
}