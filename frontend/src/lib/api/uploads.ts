import type { UploadSignature, UploadedPhoto } from "@/types/upload";
import { ApiError, request } from "./transport";

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

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${sig.cloudName}/auto/upload`,
    { method: "POST", body: form },
  );

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
