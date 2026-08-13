import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { z } from "zod";
import type { Platform } from "@/types";

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
  scheduled_at: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    const { data: schedule, error: scheduleError } = await supabase
      .from("schedules")
      .insert({
        content,
        platforms,
        media_urls,
        scheduled_at,
        status: "scheduled",
        user_id: session.user.id,
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
    const { data: post, error: postError } = await supabase
      .from("posts")
      .insert({
        schedule_id: schedule.id,
        user_id: session.user.id,
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
      await supabase.from("scheduled_items").insert({
        post_id: post.id,
        platform,
        scheduled_at: scheduled_at || new Date().toISOString(),
        status: "pending",
      });
    }

    // If scheduling for immediate post, publish now
    if (!scheduled_at) {
      // Trigger publishing via background mechanism
      // For now, mark items as ready
      await supabase.from("scheduled_items").update({
        status: "publishing",
      }).eq("post_id", post.id);

      return NextResponse.json({
        success: true,
        postId: post.id,
        scheduled: false,
        message: "Post queued for immediate publishing",
      });
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
  try {
    const { searchParams } = new URL(request.url);
    const post_id = searchParams.get("post_id");
    const user_id = searchParams.get("user_id");

    if (!post_id || !user_id) {
      return NextResponse.json(
        { error: "post_id and user_id required" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user?.id || session.user.id !== user_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get post status
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", post_id)
      .eq("user_id", user_id)
      .single();

    // Get scheduled items status
    const { data: items, error: itemsError } = await supabase
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