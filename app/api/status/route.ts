import { NextResponse } from "next/server";
import { createUserSupabaseClient, getAccessTokenFromRequest } from "@/lib/supabase-user";

export async function GET(request: Request) {
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

    // Get post (RLS ensures user only sees their own posts)
    const { data: post, error: postError } = await (supabase as any)
      .from("posts")
      .select("*")
      .eq("id", post_id)
      .single();

    // Get scheduled items
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