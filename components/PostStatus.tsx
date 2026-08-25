import { useState, useEffect, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, XCircle, Send, Clock, AlertCircle } from "lucide-react";
import type { PostStatus, Platform } from "@/types";

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending: Clock,
  publishing: Send,
  completed: CheckCircle,
  failed: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500",
  publishing: "bg-blue-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
};

export function PostStatus({ postId }: { postId: string }) {
  const [status, setStatus] = useState<PostStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 5000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [postId]);

  const fetchStatus = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const response = await fetch(`/api/status?post_id=${postId}`);
    const result = await response.json();

    if (response.ok && result.data) {
      setStatus(result.data);
      const statusVal = result.data.status;
      if (statusVal === "completed") setProgress(100);
      else if (statusVal === "publishing") setProgress(66);
      else if (statusVal === "failed") setProgress(100);
      else setProgress(33);
      setLoading(false);
    }
  };

  const Icon = status ? STATUS_ICONS[status.status] ?? AlertCircle : AlertCircle;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          Post Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading status...</p>
        ) : status ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className={STATUS_COLORS[status.status]}>
                  {status.status}
                </Badge>
                <span className="text-sm font-medium">{status.platform}</span>
              </div>
              {status.published_at && (
                <span className="text-sm text-muted-foreground">
                  Published {new Date(status.published_at).toLocaleString()}
                </span>
              )}
            </div>

            <Progress value={progress} className="h-2" />

            {status.message && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 p-3">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-600">{status.message}</p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No status available</p>
        )}
      </CardContent>
    </Card>
  );
}

export const PostStatusIcon = Send;
