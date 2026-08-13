import { z } from "zod";

export const platformEnum = z.enum(["twitter", "instagram", "tiktok", "youtube"]);

export const scheduleSchema = z.object({
  content: z.string().min(1, "Content is required").max(5000, "Content too long"),
  platforms: z.array(platformEnum).min(1, "Select at least one platform"),
  media_urls: z.array(z.string().url("Invalid URL")).optional(),
  scheduled_at: z.string().refine((val) => {
    const date = new Date(val);
    return date > new Date();
  }, "Scheduled time must be in the future"),
});

export const postSchema = z.object({
  schedule_id: z.string().uuid("Invalid schedule ID"),
  platforms: z.array(platformEnum).min(1, "Select at least one platform"),
});

export const connectionSchema = z.object({
  platform: platformEnum,
  access_token: z.string().min(1, "Access token is required"),
  refresh_token: z.string().optional(),
  expires_at: z.string().optional(),
});

export const getStatusQuerySchema = z.object({
  post_id: z.string().uuid("Invalid post ID"),
});

export type ScheduleInput = z.infer<typeof scheduleSchema>;
export type PostInput = z.infer<typeof postSchema>;
export type ConnectionInput = z.infer<typeof connectionSchema>;
export type GetStatusQueryInput = z.infer<typeof getStatusQuerySchema>;

export function validateScheduleInput(data: unknown) {
  return scheduleSchema.safeParse(data);
}

export function validatePostInput(data: unknown) {
  return postSchema.safeParse(data);
}

export function validateConnectionInput(data: unknown) {
  return connectionSchema.safeParse(data);
}

export function validateGetStatusQuery(data: unknown) {
  return getStatusQuerySchema.safeParse(data);
}
