import { Global, Module } from "@nestjs/common";
import { v2 as cloudinary } from "cloudinary";

import { ENV, type Env } from "../config/env.schema";
import {
  CLOUDINARY,
  CloudinaryService,
  type CloudinaryClient,
} from "./cloudinary.service";
import { PhotoCleanupService } from "./photo-cleanup.service";

@Global()
@Module({
  providers: [
    {
      provide: CLOUDINARY,
      useFactory: (env: Env): CloudinaryClient => {
        cloudinary.config({
          cloud_name: env.CLOUDINARY_CLOUD_NAME,
          api_key: env.CLOUDINARY_API_KEY,
          api_secret: env.CLOUDINARY_API_SECRET,
        });

        return cloudinary;
      },
      inject: [ENV],
    },
    CloudinaryService,
    PhotoCleanupService,
  ],
  exports: [CloudinaryService, PhotoCleanupService],
})
export class CloudinaryModule {}
