import { Inject, Injectable, Logger } from "@nestjs/common";
import { v2 as cloudinary } from "cloudinary";

import { ENV, type Env } from "../config/env.schema";
import { ApiError } from "../common/http/api-response";

export const CLOUDINARY = Symbol("CLOUDINARY");

export type CloudinaryClient = typeof cloudinary;

export interface IncomingPhoto {
  publicId: string;
  alt: string;
}

export interface ResolvedPhoto {
  url: string;
  publicId: string;
  alt: string;
}

export interface UploadSignature {
  signature: string;
  timestamp: number;
  expiresAt: number;
  folder: string;
  resourceType: string;
  cloudName: string;
  apiKey: string;
}

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

const SIGNATURE_TTL_SECONDS = 15 * 60;

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly photoFolder: string;

  constructor(
    @Inject(CLOUDINARY) private readonly cloudinary: CloudinaryClient,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.photoFolder = this.env.CLOUDINARY_UPLOAD_FOLDER.replace(/\/+$/, "");
  }

  async verifyAndResolve(incoming: IncomingPhoto[]): Promise<ResolvedPhoto[]> {
    return Promise.all(incoming.map((photo) => this.verifyOne(photo)));
  }

  async destroy(publicIds: string[]): Promise<void> {
    const results = await Promise.allSettled(
      publicIds.map((publicId) => this.cloudinary.uploader.destroy(publicId)),
    );

    const failed = publicIds.filter(
      (_, index) => results[index]?.status === "rejected",
    );

    if (failed.length > 0) {
      throw new ApiError(
        502,
        `Could not delete photos with the image provider: ${failed.join(", ")}`,
      );
    }
  }

  createUploadSignature(): UploadSignature {
    const timestamp = Math.round(Date.now() / 1000);
    const folder = this.env.CLOUDINARY_UPLOAD_FOLDER;

    const signature = this.cloudinary.utils.api_sign_request(
      { timestamp, folder },
      this.env.CLOUDINARY_API_SECRET,
    );

    return {
      signature,
      timestamp,
      expiresAt: timestamp + SIGNATURE_TTL_SECONDS,
      folder,
      resourceType: "image",
      cloudName: this.env.CLOUDINARY_CLOUD_NAME,
      apiKey: this.env.CLOUDINARY_API_KEY,
    };
  }

  private async verifyOne(photo: IncomingPhoto): Promise<ResolvedPhoto> {
    let resource: Awaited<ReturnType<CloudinaryClient["api"]["resource"]>>;

    try {
      resource = await this.cloudinary.api.resource(photo.publicId, {
        resource_type: "image",
      });
    } catch (error) {
      // The SDK throws the provider's error object, so the HTTP status has to be read off it.
      const httpCode =
        typeof error === "object" && error !== null && "http_code" in error
          ? (error as { http_code?: number }).http_code
          : undefined;

      // A missing asset is the client's mistake, so it gets a 400 with a useful message.
      if (httpCode === 404) {
        throw new ApiError(
          400,
          `Photo "${photo.publicId}" does not exist in storage`,
        );
      }

      // Anything else is the provider's problem, not the client's: log it and answer 502 so the
      // failure is not reported as a bad request.
      this.logger.error(
        `Cloudinary lookup failed for ${photo.publicId}: ${String(error)}`,
      );
      throw new ApiError(502, "Could not verify photo with the image provider");
    }

    if (!resource.public_id.startsWith(`${this.photoFolder}/`)) {
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

    // The stored URL is the provider's, never the client's: this is what stops a forged
    // `secure_url` from being persisted.
    return {
      url: resource.secure_url,
      publicId: photo.publicId,
      alt: photo.alt,
    };
  }
}
