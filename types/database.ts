import type { Platform } from "@/types";

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      connections: {
        Row: {
          id: string;
          user_id: string;
          platform: Platform;
          access_token: string;
          refresh_token?: string | null;
          expires_at?: string | null;
          scopes?: string[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          platform: Platform;
          access_token: string;
          refresh_token?: string | null;
          expires_at?: string | null;
          scopes?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          platform?: Platform;
          access_token?: string;
          refresh_token?: string | null;
          expires_at?: string | null;
          scopes?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      posts: {
        Row: {
          id: string;
          schedule_id?: string | null;
          user_id: string;
          content: string;
          platforms: Platform[];
          media_urls?: string[] | null;
          status: "draft" | "scheduled" | "publishing" | "posted" | "failed";
          error_message?: string | null;
          published_at?: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          schedule_id?: string | null;
          user_id: string;
          content: string;
          platforms: Platform[];
          media_urls?: string[] | null;
          status: "draft" | "scheduled" | "publishing" | "posted" | "failed";
          error_message?: string | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          schedule_id?: string | null;
          user_id?: string;
          content?: string;
          platforms?: Platform[];
          media_urls?: string[] | null;
          status?: "draft" | "scheduled" | "publishing" | "posted" | "failed";
          error_message?: string | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      schedules: {
        Row: {
          id: string;
          user_id: string;
          content: string;
          platforms: Platform[];
          media_urls?: string[] | null;
          scheduled_at: string;
          status: "draft" | "scheduled" | "publishing" | "posted" | "failed";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          content: string;
          platforms: Platform[];
          media_urls?: string[] | null;
          scheduled_at: string;
          status: "draft" | "scheduled" | "publishing" | "posted" | "failed";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          content?: string;
          platforms?: Platform[];
          media_urls?: string[] | null;
          scheduled_at?: string;
          status?: "draft" | "scheduled" | "publishing" | "posted" | "failed";
          created_at?: string;
          updated_at?: string;
        };
      };
      scheduled_items: {
        Row: {
          id: string;
          post_id: string;
          platform: Platform;
          scheduled_at: string;
          status: "pending" | "publishing" | "completed" | "failed";
          error_message?: string | null;
          published_at?: string | null;
        };
        Insert: {
          id?: string;
          post_id: string;
          platform: Platform;
          scheduled_at: string;
          status: "pending" | "publishing" | "completed" | "failed";
          error_message?: string | null;
          published_at?: string | null;
        };
        Update: {
          id?: string;
          post_id?: string;
          platform?: Platform;
          scheduled_at?: string;
          status?: "pending" | "publishing" | "completed" | "failed";
          error_message?: string | null;
          published_at?: string | null;
        };
      };
      scheduled_runs: {
        Row: {
          id: string;
          schedule_id: string;
          user_id: string;
          run_at: string;
          status: "pending" | "processing" | "completed" | "failed";
          error_message?: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          schedule_id: string;
          user_id: string;
          run_at: string;
          status: "pending" | "processing" | "completed" | "failed";
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          schedule_id?: string;
          user_id?: string;
          run_at?: string;
          status?: "pending" | "processing" | "completed" | "failed";
          error_message?: string | null;
          created_at?: string;
        };
      };
    };
  };
};
