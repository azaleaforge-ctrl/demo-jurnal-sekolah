"use client";
import { generateReactHelpers } from "@uploadthing/react";
import type { OurFileRouter } from "@/app/api/uploadthing/core";

// Helper typed sesuai FileRouter (import type-only — tanpa kode server di bundle).
export const { uploadFiles, useUploadThing } = generateReactHelpers<OurFileRouter>();
