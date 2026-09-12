import { cloudinary } from "../config/cloudinary";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { ApiError } from "../utils/apiResponse";

export const PHOTO_FOLDER = env.CLOUDINARY_UPLOAD_FOLDER.replace(/\/+$/, "");
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
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
  publicId: string;
  alt: string;
}

export interface ResolvedPhoto {
  url: string;
  publicId: string;
  alt: string;
}

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
        logger.error(
          { err, publicId: photo.publicId },
          "Cloudinary lookup failed",
        );
        throw new ApiError(
          502,
          "Could not verify photo with the image provider",
        );
      }

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
