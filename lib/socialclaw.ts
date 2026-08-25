import { createAdminSupabaseClient } from "@/lib/supabase-user";
import type { Platform, SocialPost, PlatformConnection, PostStatus } from "@/types";

const PLATFORM_APIS: Record<Platform, string> = {
  twitter: "https://api.twitter.com/2",
  instagram: "https://graph.instagram.com",
  tiktok: "https://open-api.tiktok.com",
  youtube: "https://www.googleapis.com/youtube/v3",
};

class SocialClaw {
  private supabase: any;

  constructor(supabaseClient?: any) {
    // Use provided client or fallback to admin client (for cron/background jobs)
    this.supabase = supabaseClient || createAdminSupabaseClient();
  }

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

    const post = await this.createPost(scheduleId, schedule.platforms, userId);
    if (!post) return null;

    for (const platform of post.platforms) {
      await this.createScheduledItem(post.id, platform);
    }
    return post;
  }

  private async createScheduledItem(postId: string, platform: Platform): Promise<void> {
    // Try to insert directly - the unique constraint will handle duplicates
    const { error } = await this.supabase.from("scheduled_items").insert({
      post_id: postId,
      platform,
      scheduled_at: new Date().toISOString(),
      status: "pending",
    });

    // Handle unique constraint violation (PostgreSQL error code 23505)
    if (error && (error as any).code === "23505") {
      return; // Already exists, that's fine
    }

    if (error) {
      console.error("Failed to create scheduled item:", error);
    }
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
    const mediaSize = mediaData.byteLength;

    // For videos > 15MB or any video, use chunked upload
    // Twitter requires chunked upload for videos, simple upload works for images < 5MB
    const isVideo = this.isVideoUrl(mediaUrl);
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    const needsChunkedUpload = isVideo || mediaSize > 5 * 1024 * 1024;

    if (needsChunkedUpload) {
      return this.uploadTwitterMediaChunked(mediaData, mediaSize, connection, isVideo);
    }

    // Simple upload for small images
    const uploadRes = await fetch(`${PLATFORM_APIS.twitter}/media/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
        "Content-Type": "application/octet-stream",
      },
      body: mediaData,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`Twitter media upload failed: ${uploadRes.status} ${text}`);
    }
    const data = await uploadRes.json();
    return data.media_id_string;
  }

  private isVideoUrl(url: string): boolean {
    const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];
    const lowerUrl = url.toLowerCase();
    return videoExtensions.some(ext => lowerUrl.includes(ext)) || lowerUrl.includes('video');
  }

  private async uploadTwitterMediaChunked(
    mediaData: ArrayBuffer,
    mediaSize: number,
    connection: PlatformConnection,
    isVideo: boolean
  ): Promise<string> {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    const totalChunks = Math.ceil(mediaSize / CHUNK_SIZE);

    // Step 1: INIT
    const initParams = new URLSearchParams({
      command: "INIT",
      total_bytes: mediaSize.toString(),
      media_type: isVideo ? "video/mp4" : "image/jpeg",
      media_category: isVideo ? "tweet_video" : "tweet_image",
    });

    const initRes = await fetch(`${PLATFORM_APIS.twitter}/media/upload?${initParams}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!initRes.ok) {
      const text = await initRes.text();
      throw new Error(`Twitter INIT failed: ${initRes.status} ${text}`);
    }

    const initData = await initRes.json();
    const mediaId = initData.media_id_string;

    // Step 2: APPEND chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, mediaSize);
      const chunk = mediaData.slice(start, end);

      const appendParams = new URLSearchParams({
        command: "APPEND",
        media_id: mediaId,
        segment_index: i.toString(),
      });

      const appendRes = await fetch(`${PLATFORM_APIS.twitter}/media/upload?${appendParams}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.access_token}`,
        },
        body: chunk,
      });

      if (!appendRes.ok) {
        const text = await appendRes.text();
        throw new Error(`Twitter APPEND chunk ${i} failed: ${appendRes.status} ${text}`);
      }
    }

    // Step 3: FINALIZE
    const finalizeParams = new URLSearchParams({
      command: "FINALIZE",
      media_id: mediaId,
    });

    const finalizeRes = await fetch(`${PLATFORM_APIS.twitter}/media/upload?${finalizeParams}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!finalizeRes.ok) {
      const text = await finalizeRes.text();
      throw new Error(`Twitter FINALIZE failed: ${finalizeRes.status} ${text}`);
    }

    // Step 4: STATUS check for videos (wait for processing)
    if (isVideo) {
      await this.waitForTwitterMediaProcessing(mediaId, connection);
    }

    return mediaId;
  }

  private async waitForTwitterMediaProcessing(mediaId: string, connection: PlatformConnection): Promise<void> {
    const maxAttempts = 60; // 5 minutes max (5s intervals)
    let attempts = 0;

    while (attempts < maxAttempts) {
      const statusParams = new URLSearchParams({
        command: "STATUS",
        media_id: mediaId,
      });

      const statusRes = await fetch(`${PLATFORM_APIS.twitter}/media/upload?${statusParams}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${connection.access_token}`,
        },
      });

      if (!statusRes.ok) {
        const text = await statusRes.text();
        throw new Error(`Twitter STATUS check failed: ${statusRes.status} ${text}`);
      }

      const statusData = await statusRes.json();
      const processingInfo = statusData.processing_info;

      if (!processingInfo) {
        // No processing info means it's ready
        return;
      }

      if (processingInfo.state === "succeeded") {
        return;
      }

      if (processingInfo.state === "failed") {
        throw new Error(`Twitter media processing failed: ${processingInfo.error?.message || "Unknown error"}`);
      }

      // Wait before next check
      const checkAfterSecs = processingInfo.check_after_secs || 5;
      await new Promise(resolve => setTimeout(resolve, checkAfterSecs * 1000));
      attempts++;
    }

    throw new Error("Twitter media processing timed out");
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
    const videoSize = videoData.byteLength;

    // Use resumable upload for videos > 5MB or any video
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks (YouTube recommends 256KB minimum, 10MB is good balance)
    const needsResumableUpload = videoSize > 5 * 1024 * 1024;

    if (needsResumableUpload) {
      await this.uploadYouTubeVideoResumable(videoData, videoSize, post.content, connection);
    } else {
      // Simple upload for small videos
      await this.uploadYouTubeVideoSimple(videoData, post.content, connection);
    }
  }

  private async uploadYouTubeVideoSimple(videoData: ArrayBuffer, content: string, connection: PlatformConnection): Promise<void> {
    const metadata = {
      snippet: {
        title: content.substring(0, 100),
        description: content,
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

  private async uploadYouTubeVideoResumable(
    videoData: ArrayBuffer,
    videoSize: number,
    content: string,
    connection: PlatformConnection
  ): Promise<void> {
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
    const totalChunks = Math.ceil(videoSize / CHUNK_SIZE);

    const metadata = {
      snippet: {
        title: content.substring(0, 100),
        description: content,
      },
      status: {
        privacyStatus: "private",
      },
    };

    // Step 1: Initiate resumable upload session
    const initiateRes = await fetch(
      `${PLATFORM_APIS.youtube}/videos?part=snippet,status&uploadType=resumable`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.access_token}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": "video/*",
          "X-Upload-Content-Length": videoSize.toString(),
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!initiateRes.ok) {
      const text = await initiateRes.text();
      throw new Error(`YouTube resumable init failed: ${initiateRes.status} ${text}`);
    }

    // Get the resumable upload URL from Location header
    const uploadUrl = initiateRes.headers.get("Location");
    if (!uploadUrl) {
      throw new Error("YouTube resumable upload URL not provided");
    }

    // Step 2: Upload chunks
    let bytesUploaded = 0;
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, videoSize);
      const chunk = videoData.slice(start, end);
      const chunkSize = end - start;

      const contentRange = `bytes ${start}-${end - 1}/${videoSize}`;

      let retries = 0;
      const maxRetries = 3;
      let chunkSuccess = false;

      while (retries <= maxRetries && !chunkSuccess) {
        const chunkRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${connection.access_token}`,
            "Content-Range": contentRange,
            "Content-Length": chunkSize.toString(),
          },
          body: chunk,
        });

        if (chunkRes.ok || chunkRes.status === 308) {
          // 308 = Resume Incomplete (more chunks needed), 200/201 = Complete
          chunkSuccess = true;
          bytesUploaded = end;
        } else if (chunkRes.status === 401 || chunkRes.status === 403) {
          // Token expired, refresh and retry
          const refreshed = await this.refreshConnection(connection);
          if (!refreshed) {
            throw new Error("Failed to refresh YouTube token");
          }
          connection = refreshed;
          retries++;
        } else if (chunkRes.status >= 500) {
          // Server error, retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
          retries++;
        } else {
          // Client error, don't retry
          const text = await chunkRes.text();
          throw new Error(`YouTube chunk upload failed: ${chunkRes.status} ${text}`);
        }
      }

      if (!chunkSuccess) {
        throw new Error(`YouTube chunk ${i} failed after ${maxRetries} retries`);
      }
    }

    // Verify upload completed
    if (bytesUploaded !== videoSize) {
      throw new Error(`YouTube upload incomplete: ${bytesUploaded}/${videoSize} bytes`);
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

    // Also update corresponding scheduled_items to "completed"
    const { data: post, error: postError } = await this.supabase
      .from("posts")
      .select("platforms")
      .eq("id", postId)
      .single();

    if (postError || !post) return;

    for (const platform of post.platforms) {
      await this.updateScheduledItem(postId, platform, "completed");
    }
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

    const statuses: PostStatus[] = post.platforms.map((platform: string) => {
      const item = items.find(
        (i: { platform: string }) => i.platform.toLowerCase() === platform.toLowerCase()
      );
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

  async getAllPendingRuns(userId: string): Promise<any[]> {
    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from("scheduled_runs")
      .select("*")
      .eq("status", "pending")
      .eq("user_id", userId)
      .lte("run_at", now);

    if (error) {
      console.error("Failed to get pending runs:", error);
      return [];
    }
    return data;
  }

  async updateRunStatus(runId: string, status: "pending" | "processing" | "completed" | "failed", error?: string): Promise<void> {
    const { data: currentRun, error: fetchError } = await this.supabase
      .from("scheduled_runs")
      .select("status")
      .eq("id", runId)
      .single();

    if (fetchError) throw fetchError;

    // Validate status transitions
    if (currentRun?.status === "processing" && status === "pending") {
      throw new Error("Invalid status transition: cannot go from processing back to pending");
    }

    await this.supabase
      .from("scheduled_runs")
      .update({ status, error_message: error })
      .eq("id", runId);
  }

  async cancelPost(postId: string, userId: string): Promise<void> {
    // Update post status to failed
    await this.supabase
      .from("posts")
      .update({ status: "failed", error_message: "Cancelled by user" })
      .eq("id", postId)
      .eq("user_id", userId);

    // Update corresponding scheduled_items to failed
    const { data: post, error: postError } = await this.supabase
      .from("posts")
      .select("platforms")
      .eq("id", postId)
      .single();

    if (postError || !post) return;

    for (const platform of post.platforms) {
      await this.updateScheduledItem(postId, platform, "failed", "Cancelled by user");
    }
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

// Export class for user-scoped instantiation
export { SocialClaw };

// Default export for backward compatibility (uses admin client - for cron/background jobs only)
export const socialclaw = new SocialClaw();
