import { NextResponse } from "next/server";
import { createUserSupabaseClient, getAccessTokenFromRequest } from "@/lib/supabase-user";
import { z } from "zod";
import type { Platform } from "@/types";
import { SocialClaw } from "@/lib/socialclaw";
import { rateLimiters } from "@/lib/rate-limiter";
import type { SupabaseClient } from "@supabase/supabase-js";

const connectionSchema = z.object({
  platform: z.enum(["twitter", "instagram", "tiktok", "youtube"]),
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_at: z.string().optional(),
});

const scheduleSchema = z.object({
  content: z.string().min(1).max(5000),
  platforms: z.array(z.enum(["twitter", "instagram", "tiktok", "youtube"])).min(1),
  media_urls: z.array(z.string().url()).optional(),
  scheduled_at: z.string().optional().refine(
    (val) => !val || new Date(val) > new Date(),
    "Scheduled date must be in the future"
  ),
});

export async function POST(request: Request) {
  // Rate limiting
  const rateLimitResponse = await rateLimiters.write(request as any);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    // Use user-scoped client (respects RLS)
    const accessToken = getAccessTokenFromRequest(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized - No access token" }, { status: 401 });
    }
    
    const supabase = createUserSupabaseClient(accessToken);
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create SocialClaw with user-scoped client (respects RLS)
    const socialclaw = new SocialClaw(supabase as unknown as SupabaseClient<any>);

    const body = await request.json();
    const validated = scheduleSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.format() },
        { status: 400 }
      );
    }

    const { content, platforms, media_urls, scheduled_at } = validated.data;

    // Insert schedule
    const { data: schedule, error: scheduleError } = await (supabase as any)
      .from("schedules")
      .insert({
        content,
        platforms,
        media_urls,
        scheduled_at,
        status: "scheduled",
        user_id: user.id,
      })
      .select()
      .single();

    if (scheduleError) {
      return NextResponse.json(
        { error: scheduleError.message },
        { status: 500 }
      );
    }

    // Insert post record
    const { data: post, error: postError } = await (supabase as any)
      .from("posts")
      .insert({
        schedule_id: schedule.id,
        user_id: user.id,
        content,
        platforms,
        media_urls,
        status: "scheduled",
      })
      .select()
      .single();

    if (postError) {
      return NextResponse.json(
        { error: postError.message },
        { status: 500 }
      );
    }

    // Insert scheduled items for each platform
    for (const platform of platforms) {
      const { error: itemError } = await (supabase as any).from("scheduled_items").insert({
        post_id: post.id,
        platform,
        scheduled_at: scheduled_at || new Date().toISOString(),
        status: "pending",
      });

      // Ignore unique constraint violations (duplicate scheduled items)
      if (itemError && (itemError as any).code !== "23505") {
        console.error("Failed to create scheduled item:", itemError);
      }
    }

    // If scheduling for immediate post, publish now
    if (!scheduled_at) {
      // Publish to each platform
      const publishResults = [];
      for (const platform of platforms) {
        const result = await socialclaw.publishToPlatform(post.id, platform, user.id);
        publishResults.push({ platform, ...result });
      }

      const allFailed = publishResults.every(r => !r.success);
      
      return NextResponse.json({
        success: true,
        postId: post.id,
        scheduled: false,
        message: allFailed ? "Post publishing failed on all platforms" : "Post published successfully",
        results: publishResults,
      });
    }

    // Create scheduled run for future posts
    if (scheduled_at) {
      await socialclaw.schedulePostRun(schedule.id, user.id, new Date(scheduled_at));
    }

    return NextResponse.json({
      success: true,
      postId: post.id,
      scheduled: true,
      scheduledAt: scheduled_at,
      message: "Post scheduled successfully",
    });

  } catch (error) {
    console.error("Schedule API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  // Rate limiting
  const rateLimitResponse = await rateLimiters.status(request as any);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    // Use user-scoped client (respects RLS)
    const accessToken = getAccessTokenFromRequest(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized - No access token" }, { status: 401 });
    }
    
    const supabase = createUserSupabaseClient(accessToken);
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const post_id = searchParams.get("post_id");
    
    if (!post_id) {
      return NextResponse.json(
        { error: "post_id required" },
        { status: 400 }
      );
    }

    // Get post status (RLS will ensure user only sees their own posts)
    const { data: post, error: postError } = await (supabase as any)
      .from("posts")
      .select("*")
      .eq("id", post_id)
      .single();

    // Get scheduled items status
    const { data: items, error: itemsError } = await (supabase as any)
      .from("scheduled_items")
      .select("*")
      .eq("post_id", post_id);

    if (postError || !post) {
      return NextResponse.json(
        { error: postError?.message || "Post not found" },
        { status: 404 }
      );
    }

    // Build status map
    const statuses = items?.reduce((acc: any, item: any) => {
      acc[item.platform] = {
        status: item.status,
        message: item.error_message,
        published_at: item.published_at,
      };
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data: {
        post: {
          id: post.id,
          content: post.content,
          platforms: post.platforms,
          status: post.status,
          scheduled_at: post.scheduled_at,
          published_at: post.published_at,
          error_message: post.error_message,
        },
        platforms: post.platforms.map((p: string) => ({
          platform: p,
          ...statuses[p],
        })),
      },
    });
  } catch (error) {
    console.error("Status API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}