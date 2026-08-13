export type Platform = "twitter" | "instagram" | "tiktok" | "youtube";

export interface SocialPost {
  id: string;
  content: string;
  platforms: Platform[];
  media_urls?: string[];
  scheduled_at: string;
  status: "draft" | "scheduled" | "publishing" | "posted" | "failed";
  user_id: string;
  created_at: string;
  updated_at: string;
  error_message?: string;
  published_at?: string;
  scheduled_id?: string;
}

export interface ScheduledItem {
  id: string;
  post_id: string;
  platform: Platform;
  scheduled_at: string;
  status: "pending" | "publishing" | "completed" | "failed";
  error_message?: string;
  published_at?: string;
}

export interface PlatformConnection {
  id: string;
  user_id: string;
  platform: Platform;
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  scopes?: string[];
  created_at: string;
  updated_at: string;
}

export interface PostStatus {
  post_id: string;
  platform: Platform;
  status: "pending" | "publishing" | "completed" | "failed";
  message?: string;
  published_at?: string;
}

export interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
}

export interface ScheduleFormData {
  content: string;
  platforms: Platform[];
  media_urls: string[];
  scheduled_at: Date | undefined;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
