import { useState, useEffect } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/ui/use-toast";
import type { Platform } from "@/types";

const PLATFORM_OPTIONS: { value: Platform; label: string; color: string }[] = [
  { value: "twitter", label: "X / Twitter", color: "bg-blue-500" },
  { value: "instagram", label: "Instagram", color: "bg-pink-500" },
  { value: "tiktok", label: "TikTok", color: "bg-black" },
  { value: "youtube", label: "YouTube", color: "bg-red-500" },
];

export function ScheduleForm() {
  const [content, setContent] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string>("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [scheduledAt, setScheduledAt] = useState<Date>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const { toast } = useToast();

  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  const handleSubmit = async (type: "draft" | "schedule") => {
    if (!content.trim() || selectedPlatforms.length === 0) {
      toast({
        title: "Error",
        description: "Please enter content and select at least one platform",
        variant: "destructive",
      });
      return;
    }

    if (type === "schedule" && !scheduledAt) {
      toast({
        title: "Error",
        description: "Please select a scheduled date and time",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        toast({
          title: "Error",
          description: "You must be logged in",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      const media = mediaUrls
        .split("\n")
        .map((url) => url.trim())
        .filter((url) => url.length > 0);

      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          platforms: selectedPlatforms,
          media_urls: media,
          scheduled_at: scheduledAt ? scheduledAt.toISOString() : new Date().toISOString(),
          status: type,
          user_id: session.user.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to create schedule");
      }

      toast({
        title: "Success",
        description:
          type === "draft"
            ? "Saved as draft"
            : `Scheduled for ${format(scheduledAt!, "PPP p")}`,
      });

      setContent("");
      setMediaUrls("");
      setSelectedPlatforms([]);
      setScheduledAt(undefined);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Post</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="content">Content</Label>
          <Textarea
            id="content"
            placeholder="What's on your mind?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="media">Media URLs</Label>
          <Textarea
            id="media"
            placeholder="Enter media URLs (one per line)"
            value={mediaUrls}
            onChange={(e) => setMediaUrls(e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Platforms</Label>
          <div className="grid grid-cols-2 gap-2">
            {PLATFORM_OPTIONS.map((platform) => (
              <div
                key={platform.value}
                className="flex items-center space-x-2 rounded-lg border p-3"
              >
                <Checkbox
                  id={platform.value}
                  checked={selectedPlatforms.includes(platform.value)}
                  onCheckedChange={() => togglePlatform(platform.value)}
                />
                <Label htmlFor={platform.value} className="cursor-pointer flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-3 w-3 rounded-full ${platform.color}`} />
                    {platform.label}
                  </div>
                </Label>
              </div>
            ))}
          </div>
        </div>

        {selectedPlatforms.length > 0 && (
          <div className="space-y-2">
            <Label>Schedule For</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !scheduledAt && "text-muted-foreground"
                  )}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {scheduledAt ? format(scheduledAt, "PPP p") : "Pick a date and time"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <CalendarComponent
                  mode="single"
                  selected={scheduledAt}
                  onSelect={setScheduledAt}
                  initialFocus
                />
                <div className="border-t p-3">
                  <Input
                    type="datetime-local"
                    value={scheduledAt ? format(scheduledAt, "yyyy-MM-dd HH:mm") : ""}
                    onChange={(e) => setScheduledAt(new Date(e.target.value))}
                  />
                </div>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              If not set, post immediately upon publishing
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => handleSubmit("draft")}
            disabled={isSubmitting}
          >
            Save Draft
          </Button>
          <Button
            onClick={() => handleSubmit("schedule")}
            disabled={isSubmitting || selectedPlatforms.length === 0}
          >
            {isSubmitting ? "Saving..." : "Schedule Post"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export const ScheduleFormIcon = Calendar;
