import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Platform, SocialPost, PlatformConnection, PostStatus } from "@/types";

const PLATFORM_APIS: Record<Platform, string> = {
  twitter: "https://api.twitter.com/2",
  instagram: "https://graph.instagram.com",
  tiktok: "https://open-api.tiktok.com",
  youtube: "https://www.googleapis.com/youtube/v3",
};

class SocialClaw {
  private supabase = createServerSupabaseClient();

  async getConnection(userId: string, platform: Platform): Promise<PlatformConnection | null> {
    const { data, error } = await this.supabase
      .from("connections")
      .select("*")
      .eq("user_id", userId)
      .eq("platform", platform)
      .single();

    if (error) {
      console.error(`Failed to get ${platform} connection:`, error);
      return null;
    }
    return data;
  }

  async refreshConnection(connection: PlatformConnection): Promise<PlatformConnection | null> {
    if (!connection.refresh_token || !connection.expires_at) return connection;

    const now = new Date();
    const expiresAt = new Date(connection.expires_at);
    if (expiresAt > new Date(now.getTime() + 5 * 60 * 1000)) return connection;

    const tokenEndpoint: Record<Platform, string> = {
      twitter: "https://api.twitter.com/2/oauth2/token",
      instagram: "https://graph.instagram.com/refresh_access_token",
      tiktok: PLATFORM_APIS.tiktok + "/oauth2/token/",
      youtube: "https://oauth2.googleapis.com/token",
    };

    const params: Record<string, string> = {
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token,
    };

    if (platformHasClientId(connection.platform)) {
      params.client_id = getPlatformClientId(connection.platform);
      params.client_secret = getPlatformSecret(connection.platform);
    }

    try {
      const response = await fetch(tokenEndpoint[connection.platform], {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params).toString(),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      const tokenData = await response.json();
      const newToken = tokenData.access_token;
      const newRefreshToken = tokenData.refresh_token ?? connection.refresh_token;
      const newExpiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000);

      const { data, error } = await this.supabase
        .from("connections")
        .update({
          access_token: newToken,
          refresh_token: newRefreshToken,
          expires_at: newExpiresAt.toISOString(),
        })
        .eq("id", connection.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`Failed to refresh ${connection.platform} token:`, error);
      return null;
    }
  }

  async createPost(scheduleId: string, platforms: Platform[], userId: string): Promise<SocialPost | null> {
    const { data: schedule, error: scheduleError } = await this.supabase
      .from("schedules")
      .select("*")
      .eq("id", scheduleId)
      .eq("user_id", userId)
      .single();

    if (scheduleError || !schedule) {
      console.error("Failed to find schedule:", scheduleError);
      return null;
    }

    const { data: post, error: postError } = await this.supabase
      .from("posts")
      .insert({
        schedule_id: scheduleId,
        user_id: userId,
        content: schedule.content,
        platforms,
        media_urls: schedule.media_urls,
        status: "scheduled",
      })
      .select()
      .single();

    if (postError) {
      console.error("Failed to create post:", postError);
      return null;
    }
    return post;
  }

  async schedulePost(scheduleId: string, userId: string): Promise<SocialPost | null> {
    const post = await this.createPost(scheduleId, ["twitter" as Platform], userId);
    if (!post) return null;

    for (const platform of post.platforms) {
      await this.createScheduledItem(post.id, platform);
    }
    return post;
  }

  private async createScheduledItem(postId: string, platform: Platform): Promise<void> {
    await this.supabase.from("scheduled_items").insert({
      post_id: postId,
      platform,
      scheduled_at: new Date().toISOString(),
      status: "pending",
    });
  }

  async publishToPlatform(
    postId: string,
    platform: Platform,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    const { data: post, error: postError } = await this.supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .eq("user_id", userId)
      .single();

    if (postError || !post) {
      return { success: false, error: "Post not found" };
    }

    const connection = await this.getConnection(userId, platform);
    if (!connection) {
      return { success: false, error: `No ${platform} connection found` };
    }

    const validConnection = await this.refreshConnection(connection);
    if (!validConnection) {
      return { success: false, error: `Failed to refresh ${platform} connection` };
    }

    await this.updateScheduledItem(postId, platform, "publishing");

    try {
      switch (platform) {
        case "twitter":
          await this.postToTwitter(post, validConnection);
          break;
        case "instagram":
          await this.postToInstagram(post, validConnection);
          break;
        case "tiktok":
          await this.postToTikTok(post, validConnection);
          break;
        case "youtube":
          await this.postToYouTube(post, validConnection);
          break;
      }

      await this.updateScheduledItem(postId, platform, "completed");
      await this.markPostAsPosted(postId);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      await this.updateScheduledItem(postId, platform, "failed", errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  private async postToTwitter(post: SocialPost, connection: PlatformConnection): Promise<void> {
    const apiUrl = `${PLATFORM_APIS.twitter}/tweets`;
    const payload: { text: string; media?: { media_ids: string[] } } = { text: post.content };

    if (post.media_urls && post.media_urls.length > 0) {
      const mediaIds = await Promise.all(
        post.media_urls.map((url) => this.uploadTwitterMedia(url, connection))
      );
      payload.media = { media_ids: mediaIds };
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Twitter API error: ${response.status} ${text}`);
    }
  }

  private async uploadTwitterMedia(mediaUrl: string, connection: PlatformConnection): Promise<string> {
    const response = await fetch(mediaUrl);
    const mediaData = await response.arrayBuffer();

    const uploadRes = await fetch(`${PLATFORM_APIS.twitter}/media/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
        "Content-Type": "application/octet-stream",
      },
      body: mediaData,
    });

    if (!uploadRes.ok) throw new Error("Failed to upload media to Twitter");
    const data = await uploadRes.json();
    return data.media_id_string;
  }

  private async postToInstagram(post: SocialPost, connection: PlatformConnection): Promise<void> {
    const apiUrl = `${PLATFORM_APIS.instagram}/me/media`;

    const payload: Record<string, string> = {
      image_url: post.media_urls?.[0] ?? "",
      caption: post.content,
      access_token: connection.access_token,
    };

    const createRes = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`Instagram API error: ${createRes.status} ${text}`);
    }

    const { id } = await createRes.json();
    const publishRes = await fetch(`${PLATFORM_APIS.instagram}/me/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `creation_id=${id}&access_token=${connection.access_token}`,
    });

    if (!publishRes.ok) {
      const text = await publishRes.text();
      throw new Error(`Instagram publish error: ${publishRes.status} ${text}`);
    }
  }

  private async postToTikTok(post: SocialPost, connection: PlatformConnection): Promise<void> {
    const openId = connection.access_token;
    const videoUrl = post.media_urls?.[0];

    if (!videoUrl) {
      throw new Error("TikTok requires a video for posting");
    }

    const initRes = await fetch(`${PLATFORM_APIS.tiktok}/v2/video/init/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connection.access_token}`,
      },
      body: JSON.stringify({
        open_id: openId,
        source: "socialclaw",
        title: post.content,
        description: post.content,
      }),
    });

    if (!initRes.ok) {
      const text = await initRes.text();
      throw new Error(`TikTok init error: ${initRes.status} ${text}`);
    }

    const initData = await initRes.json();
    const uploadUrl = initData.data?.upload_url;
    if (!uploadUrl) throw new Error("Failed to get TikTok upload URL");

    const videoRes = await fetch(videoUrl);
    const videoData = await videoRes.arrayBuffer();

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: videoData,
    });

    if (!uploadRes.ok) {
      throw new Error(`TikTok upload failed: ${uploadRes.status}`);
    }

    const publishRes = await fetch(`${PLATFORM_APIS.tiktok}/v2/video/publish/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connection.access_token}`,
      },
      body: JSON.stringify({
        open_id: openId,
        upload_id: initData.data.upload_id,
        title: post.content,
        description: post.content,
      }),
    });

    if (!publishRes.ok) {
      const text = await publishRes.text();
      throw new Error(`TikTok publish error: ${publishRes.status} ${text}`);
    }
  }

  private async postToYouTube(post: SocialPost, connection: PlatformConnection): Promise<void> {
    if (!post.media_urls || post.media_urls.length === 0) {
      throw new Error("YouTube requires a video for posting");
    }

    const videoUrl = post.media_urls[0];
    const videoRes = await fetch(videoUrl);
    const videoData = await videoRes.arrayBuffer();

    const metadata = {
      snippet: {
        title: post.content.substring(0, 100),
        description: post.content,
      },
      status: {
        privacyStatus: "private",
      },
    };

    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("media", new Blob([videoData]), "video.mp4");

    const response = await fetch(`${PLATFORM_APIS.youtube}/videos?part=snippet,status`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
      },
      body: form,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`YouTube API error: ${response.status} ${text}`);
    }
  }

  async updateScheduledItem(
    postId: string,
    platform: Platform,
    status: "pending" | "publishing" | "completed" | "failed",
    errorMessage?: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from("scheduled_items")
      .update({
        status,
        error_message: errorMessage,
        published_at: status === "completed" ? new Date().toISOString() : null,
      })
      .eq("post_id", postId)
      .eq("platform", platform);

    if (error) {
      console.error("Failed to update scheduled item:", error);
    }
  }

  async markPostAsPosted(postId: string): Promise<void> {
    await this.supabase
      .from("posts")
      .update({
        status: "posted",
        published_at: new Date().toISOString(),
      })
      .eq("id", postId);
  }

  async getPostStatus(postId: string, userId: string): Promise<PostStatus | null> {
    const { data: post, error: postError } = await this.supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .eq("user_id", userId)
      .single();

    if (postError || !post) return null;

    const { data: items, error: itemsError } = await this.supabase
      .from("scheduled_items")
      .select("*")
      .eq("post_id", postId);

    if (itemsError) return null;

    const statuses: PostStatus[] = post.platforms.map((platform) => {
      const item = items.find((i) => i.platform === platform);
      return {
        post_id: postId,
        platform,
        status: item?.status ?? "pending",
        message: item?.error_message,
        published_at: item?.published_at,
      };
    });

    return statuses[0] ?? null;
  }

  async schedulePostRun(scheduleId: string, userId: string, runAt: Date): Promise<boolean> {
    const { error } = await this.supabase
      .from("scheduled_runs")
      .insert({
        schedule_id: scheduleId,
        user_id: userId,
        run_at: runAt.toISOString(),
        status: "pending",
      })
      .single();

    if (error) {
      console.error("Failed to schedule run:", error);
      return false;
    }
    return true;
  }

  async getAllPendingRuns(): Promise<any[]> {
    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from("scheduled_runs")
      .select("*")
      .eq("status", "pending")
      .lte("run_at", now);

    if (error) {
      console.error("Failed to get pending runs:", error);
      return [];
    }
    return data;
  }

  async updateRunStatus(runId: string, status: "pending" | "processing" | "completed" | "failed", error?: string): Promise<void> {
    await this.supabase
      .from("scheduled_runs")
      .update({ status, error_message: error })
      .eq("id", runId);
  }
}

function platformHasClientId(platform: Platform): boolean {
  return true;
}

function getPlatformClientId(platform: Platform): string {
  const envVar = `${platform.toUpperCase()}_CLIENT_ID`;
  const key = process.env[envVar];
  if (!key) throw new Error(`Missing ${platform} client ID`);
  return key;
}

function getPlatformSecret(platform: Platform): string {
  const keys: Record<Platform, string> = {
    twitter: process.env.TWITTER_CLIENT_SECRET!,
    instagram: process.env.INSTAGRAM_CLIENT_SECRET!,
    tiktok: process.env.TIKTOK_CLIENT_SECRET!,
    youtube: process.env.YOUTUBE_CLIENT_SECRET!,
  };
  return keys[platform];
}

export const socialclaw = new SocialClaw();
