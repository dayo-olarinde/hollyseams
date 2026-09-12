
export interface UploadSignature {
  signature: string;
  timestamp: number;
  expiresAt: number;
  folder: string;
  resourceType: string;
  cloudName: string;
  apiKey: string;
}

export interface UploadedPhoto {
  publicId: string;
  url: string;
}
