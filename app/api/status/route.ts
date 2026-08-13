import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

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

    // Get post
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", post_id)
      .eq("user_id", user_id)
      .single();

    // Get scheduled items
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

    // Build status response
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
        post_id,
        post: {
          id: post.id,
          content: post.content,
          platforms: post.platforms,
          overall_status: post.status,
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