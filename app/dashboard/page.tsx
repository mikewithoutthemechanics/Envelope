"use client";

import { Dashboard } from "@/components/Dashboard";
import { Navigation } from "@/components/Navigation";
import type { SocialPost, ScheduledItem, PostStatus as PostStatusType } from "@/types";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { Clock, Send, CheckCircle, XCircle } from "lucide-react";

const statusIcons = {
  pending: Clock,
  publishing: Send,
  completed: CheckCircle,
  failed: XCircle,
};

export default function DashboardPage() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [postStatuses, setPostStatuses] = useState<Map<string, PostStatusType>>(new Map());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }

    const { data: postsData, error: postsError } = await supabase
      .from("posts")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (!postsError && postsData) setPosts(postsData);

    const { data: itemsData, error: itemsError } = await supabase
      .from("scheduled_items")
      .select("*")
      .order("scheduled_at", { ascending: false })
      .limit(50);

    if (!itemsError && itemsData) setItems(itemsData);

    // Fetch status for each post
    for (const post of posts) {
      const statusResp = await fetch(
        `/api/status?post_id=${post.id}&user_id=${session.user.id}`
      );
      const statusResult = await statusResp.json();
      if (statusResult?.data) {
        setPostStatuses((prev) => new Map(prev).set(post.id, statusResult.data));
      }
    }

    setLoading(false);
  };

  const statusConfig = {
    pending: { icon: "Clock", color: "bg-yellow-500", label: "Pending" },
    publishing: { icon: "Send", color: "bg-blue-500", label: "Publishing" },
    completed: { icon: "CheckCircle", color: "bg-green-500", label: "Posted" },
    failed: { icon: "XCircle", color: "bg-red-500", label: "Failed" },
  };

  const totalPosts = posts.length;
  const postedCount = posts.filter((p: SocialPost) => p.status === "posted").length;
  const scheduledCount = posts.filter(
    (p: SocialPost) => p.status === "scheduled" || p.status === "publishing"
  ).length;
  const failedCount = posts.filter((p: SocialPost) => p.status === "failed").length;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="p-6 md:ml-64">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Posts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalPosts}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {scheduledCount}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Posted</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {postedCount}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Failed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {failedCount}
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recent activity</p>
                ) : (
                  <div className="space-y-3">
                    {items.map((item: ScheduledItem) => {
                      const s = postStatuses.get(item.post_id) || {};
                      const StatusIcon = statusIcons[item.status] ?? Clock;
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <div className="rounded-full bg-muted p-2">
                              <StatusIcon className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-medium">{item.platform}</p>
                              <p className="text-sm text-muted-foreground">
                                {item.error_message ?? "No errors"}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge
                              variant={item.status === "completed" ? "default" : "outline"}
                              className={statusConfig[item.status]?.color}
                            >
                              {statusConfig[item.status]?.label ?? "Unknown"}
                            </Badge>
                            {item.published_at && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatDistanceToNow(
                                  new Date(item.published_at),
                                  { addSuffix: true }
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Your Posts</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading posts...</p>
                ) : posts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No posts yet</p>
                ) : (
                  <div className="space-y-3">
                    {posts.map((post: SocialPost) => {
                      const s = postStatuses.get(post.id) || {};
                      return (
                        <div
                          key={post.id}
                          className="border rounded-lg p-3"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="secondary">{post.status}</Badge>
                            <div className="flex gap-1">
                              {post.platforms.map((p: string) => (
                                <Badge key={p} variant="outline">
                                  {p}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <p className="text-sm line-clamp-2">
                            {post.content}
                          </p>
                          {post.scheduled_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Scheduled: {
                                new Date(post.scheduled_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}