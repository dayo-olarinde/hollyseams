/**
 * Server-side gate between a signed direct upload and the database.
 *
 * The browser uploads files straight to Cloudinary (the server never sees
 * bytes), then sends back the public_id Cloudinary returned. The DB must
 * never trust a client-supplied URL string, so every photo is verified here
 * against Cloudinary's own API and the URL that gets persisted is derived
 * from Cloudinary's response — never from the client.
 */
import { cloudinary } from "../config/cloudinary";
import { env } from "../config/env";
import { ApiError } from "../utils/apiResponse";
import { logger } from "../config/logger";

// Trailing slash stripped so the `startsWith(PHOTO_FOLDER + "/")` prefix
// check below stays exact (no "//" collisions).
export const PHOTO_FOLDER = env.CLOUDINARY_UPLOAD_FOLDER.replace(/\/+$/, "");
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB — phone photos, not videos
const ALLOWED_IMAGE_FORMATS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "heic",
  "heif",
  "avif",
]);

export interface IncomingPhoto {
  /** public_id returned by Cloudinary's upload response — the only trusted handle. */
  publicId: string;
  alt: string;
}

export interface ResolvedPhoto {
  /** Canonical delivery URL from Cloudinary — server-derived, never client-supplied. */
  url: string;
  publicId: string;
  alt: string;
}

/**
 * Verify every photo actually exists in our Cloudinary folder as a
 * reasonable-size image, and resolve it to a server-derived URL. Throws a
 * 400 naming the first offending photo; nothing is persisted on failure.
 */
export const verifyAndResolvePhotos = async (
  photos: IncomingPhoto[],
): Promise<ResolvedPhoto[]> => {
  return Promise.all(
    photos.map(async (photo) => {
      let resource: Awaited<ReturnType<typeof cloudinary.api.resource>>;
      try {
        resource = await cloudinary.api.resource(photo.publicId, {
          resource_type: "image",
        });
      } catch (err) {
        // Cloudinary reports a missing/unauthorized asset as a 404 from the Admin API.
        const httpCode =
          typeof err === "object" && err !== null && "http_code" in err
            ? (err as { http_code?: number }).http_code
            : undefined;
        if (httpCode === 404) {
          throw new ApiError(
            400,
            `Photo "${photo.publicId}" does not exist in storage`,
          );
        }
        logger.error({ err, publicId: photo.publicId }, "Cloudinary lookup failed");
        throw new ApiError(502, "Could not verify photo with the image provider");
      }

      // Check the public_id prefix, NOT the `folder` field: Cloudinary does
      // not always populate `folder` (it came back undefined on this
      // account — depends on the account's folder mode), while public_id
      // always embeds the path we signed the client into. The trailing "/"
      // also blocks prefix collisions like "hollyseams/photos2/...".
      if (!resource.public_id.startsWith(`${PHOTO_FOLDER}/`)) {
        throw new ApiError(
          400,
          `Photo "${photo.publicId}" is not inside the app's upload folder`,
        );
      }
      if (!ALLOWED_IMAGE_FORMATS.has(resource.format ?? "")) {
        throw new ApiError(
          400,
          `Photo "${photo.publicId}" is not a supported image format`,
        );
      }
      if (resource.bytes > MAX_IMAGE_BYTES) {
        throw new ApiError(
          400,
          `Photo "${photo.publicId}" exceeds the 10 MB size limit`,
        );
      }

      return {
        url: resource.secure_url,
        publicId: photo.publicId,
        alt: photo.alt,
      };
    }),
  );
};

/**
 * Best-effort removal of Cloudinary assets. Called after the DB write
 * succeeds so a cleanup failure can never lose job data — the worst case is
 * an orphaned asset, which the log captures.
 */
export const destroyPhotos = async (publicIds: string[]): Promise<void> => {
  await Promise.all(
    publicIds.map(async (publicId) => {
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        logger.warn({ err, publicId }, "Failed to destroy Cloudinary photo");
      }
    }),
  );
};