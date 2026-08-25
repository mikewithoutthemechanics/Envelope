import { NextResponse } from "next/server";
import { createUserSupabaseClient, getAccessTokenFromRequest } from "@/lib/supabase-user";
import { z } from "zod";
import type { Platform } from "@/types";
import { rateLimiters } from "@/lib/rate-limiter";

const connectSchema = z.object({
  platform: z.enum(["twitter", "instagram", "tiktok", "youtube"]),
  user_id: z.string().uuid(),
});

export async function POST(request: Request) {
  // Rate limiting
  const rateLimitResponse = await rateLimiters.connect(request as any);
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

    const body = await request.json();
    const validated = connectSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.format() },
        { status: 400 }
      );
    }

    const { platform } = validated.data;
    const userId = user.id; // Use authenticated user's ID

    // For OAuth flow, we need to generate an auth URL
    // Each platform has its own OAuth endpoint
    let authUrl: string;

    switch (platform) {
      case "twitter": {
        // Twitter OAuth 2.0 for elevated access
        const clientId = process.env.TWITTER_CLIENT_ID;
        if (!clientId) {
          return NextResponse.json(
            { error: "Twitter client ID not configured" },
            { status: 500 }
          );
        }
        authUrl = `https://api.twitter.com/oauth2.0/authorize?client_id=${clientId}&response_type=code&scope=tweet.read+tweet.write+users.read+offline.access&state=${crypto.randomUUID()}&redirect_uri=${encodeURIComponent(
          `${process.env.NEXTAUTH_URL}/api/callback/twitter`
        )}`;
        break;
      }

      case "instagram": {
        // Instagram OAuth
        const igClientId = process.env.INSTAGRAM_CLIENT_ID;
        if (!igClientId) {
          return NextResponse.json(
            { error: "Instagram client ID not configured" },
            { status: 500 }
          );
        }
        authUrl = `https://api.instagram.com/oauth/authorize?client_id=${igClientId}&response_type=code&scope=user_profile,user_media&state=${crypto.randomUUID()}&redirect_uri=${encodeURIComponent(
          `${process.env.NEXTAUTH_URL}/api/callback/instagram`
        )}`;
        break;
      }

      case "tiktok": {
        // TikTok OAuth
        const ttClientKey = process.env.TIKTOK_CLIENT_KEY;
        if (!ttClientKey) {
          return NextResponse.json(
            { error: "TikTok client key not configured" },
            { status: 500 }
          );
        }
        authUrl = `https://oauth.tiktok.com/v2/authorize?client_key=${ttClientKey}&response_type=code&scope=user.info.basic,user.info.profile&state=${crypto.randomUUID()}&redirect_uri=${encodeURIComponent(
          `${process.env.NEXTAUTH_URL}/api/callback/tiktok`
        )}`;
        break;
      }

      case "youtube": {
        // YouTube OAuth - uses Google
        authUrl = `${process.env.NEXTAUTH_URL}/auth/signin`;
        break;
      }

      default:
        return NextResponse.json(
          { error: "Unsupported platform" },
          { status: 400 }
        );
    }

    // Store connection request in database (pending state)
    const { error } = await (supabase as any)
      .from("connections")
      .insert({
        user_id: userId,
        platform,
        access_token: "",
        refresh_token: "",
        expires_at: "",
        status: "pending_oauth",
      });

    if (error) {
      return NextResponse.json(
        { error: "Failed to store connection request" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      auth_url: authUrl,
      platform,
      message: "OAuth flow started. Complete authentication on the platform site.",
    });
  } catch (error) {
    console.error("Connect API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}