import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { z } from "zod";
import type { Platform } from "@/types";

const postSchema = z.object({
  post_id: z.string().uuid(),
  platforms: z.array(z.enum(["twitter", "instagram", "tiktok", "youtube"])).optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = postSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.format() },
        { status: 400 }
      );
    }

    const { post_id, platforms } = validated.data;
    const userId = session.user.id;

    // If no platforms specified, publish all platforms for this post
    const platformsToPublish = platforms || (await getPostPlatforms(supabase, post_id, userId));

    // Update scheduled items status to publishing
    if (platformsToPublish.length > 0) {
      for (const platform of platformsToPublish) {
        await supabase.from("scheduled_items").update({
          status: "publishing",
        }).eq("post_id", post_id).eq("platform", platform);
      }
    }

    // Start the posting process - in a real app, this would trigger a background worker
    // For now, we'll update the status and return
    await supabase.from("posts").update({
      status: "publishing",
    }).eq("id", post_id);

    return NextResponse.json({
      success: true,
      postId: post_id,
      platforms: platformsToPublish,
      message: "Post publishing initiated",
    });
  } catch (error) {
    console.error("Post API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function getPostPlatforms(supabase: any, postId: string, userId: string) {
  const { data: post } = await supabase
    .from("posts")
    .select("platforms")
    .eq("id", postId)
    .single();

  return post?.platforms || [];
  }
}