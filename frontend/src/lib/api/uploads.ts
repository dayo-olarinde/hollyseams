import type { UploadSignature, UploadedPhoto } from "@/types/upload";
import { ApiError, request } from "./transport";

/** Photo uploads get their own ceiling: large files over mobile data are slow by nature. */
const UPLOAD_TIMEOUT_MS = 120_000;

export async function getUploadSignature() {
  const res = await request<UploadSignature>({ url: "/jobs/signature" });
  return res.data!;
}

export async function uploadPhotoToCloudinary(
  file: File,
  sig: UploadSignature,
): Promise<UploadedPhoto> {
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", sig.apiKey);
  form.append("timestamp", String(sig.timestamp));
  form.append("expires_at", String(sig.expiresAt));
  form.append("folder", sig.folder);
  form.append("resource_type", sig.resourceType);
  form.append("signature", sig.signature);

  // An AbortController timeout, not axios: this is a browser fetch straight to Cloudinary.
  // Phone uploads crawl — 10MB over a weak connection can take minutes — so the ceiling is
  // generous, but a ceiling there must be: without one a stalled upload pins the picker's
  // "uploading" state forever, with no error and no retry.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${sig.cloudName}/auto/upload`,
      { method: "POST", body: form, signal: controller.signal },
    );
  } catch {
    // An abort surfaces here as a generic TypeError; naming the failure keeps the picker's retry
    // message honest instead of browser noise.
    throw new ApiError(0, "Upload timed out. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new ApiError(
      response.status,
      body?.error?.message ?? "Upload to Cloudinary failed",
    );
  }

  const body = (await response.json()) as {
    public_id: string;
    secure_url: string;
  };
  return { publicId: body.public_id, url: body.secure_url };
}
