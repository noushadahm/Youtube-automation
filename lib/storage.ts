import fs from "node:fs/promises";
import path from "node:path";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getEnv } from "@/lib/env";

const env = getEnv();
const BUCKET = env.supabaseStorageBucket;

let bucketEnsured = false;

/**
 * Create the storage bucket on first use, lazy. Idempotent; safe to call many
 * times. Bucket is private — access must go through signed URLs.
 */
async function ensureBucket() {
  if (bucketEnsured) return;
  const supabase = getSupabaseServiceClient();
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (error && !error.message.toLowerCase().includes("already exists")) {
      throw new Error(`Failed to create bucket ${BUCKET}: ${error.message}`);
    }
  }
  bucketEnsured = true;
}

export async function uploadBuffer({
  path: objectPath,
  buffer,
  contentType
}: {
  path: string;
  buffer: Buffer | Uint8Array;
  contentType: string;
}): Promise<{ path: string }> {
  await ensureBucket();
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, buffer, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return { path: objectPath };
}

export async function uploadLocalFile({
  localPath,
  objectPath,
  contentType
}: {
  localPath: string;
  objectPath: string;
  contentType: string;
}): Promise<{ path: string }> {
  const buffer = await fs.readFile(localPath);
  return uploadBuffer({ path: objectPath, buffer, contentType });
}

export async function getSignedUrl(objectPath: string, expiresIn = 60 * 60): Promise<string> {
  await ensureBucket();
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(objectPath, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(`Signed URL failed: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

export async function downloadToLocal(
  objectPath: string,
  destination: string
): Promise<string> {
  await ensureBucket();
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(objectPath);
  if (error || !data) {
    throw new Error(`Download failed: ${error?.message ?? "no data"}`);
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(destination, buffer);
  return destination;
}

export async function downloadToBuffer(objectPath: string): Promise<Buffer> {
  await ensureBucket();
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(objectPath);
  if (error || !data) {
    throw new Error(`Download failed: ${error?.message ?? "no data"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Storage-path detection. Anything that isn't an absolute filesystem path and
 * doesn't start with http/https is treated as a Supabase Storage object path.
 */
export function isStoragePath(value: string | null | undefined) {
  if (!value) return false;
  if (value.startsWith("http://") || value.startsWith("https://")) return false;
  if (path.isAbsolute(value)) return false;
  return true;
}

export const STORAGE_BUCKET = BUCKET;
