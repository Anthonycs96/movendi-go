import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { Storage } from "@google-cloud/storage";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StorageProviderName = "local" | "gcs" | "s3";
export type StoredLocation = { provider: StorageProviderName; bucket: string; key: string };

export interface ObjectStorageProvider {
  readonly name: StorageProviderName;
  readonly bucket: string;
  put(key: string, body: Buffer, mimeType: string, metadata: Record<string, string>): Promise<void>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  signedReadUrl(key: string, filename: string, mimeType: string, ttlSeconds: number): Promise<string | null>;
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable obligatoria ${name} para el almacenamiento de objetos.`);
  return value;
}

function safeLocalPath(root: string, key: string) {
  const target = resolve(root, ...key.split("/"));
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (!target.startsWith(prefix)) throw new Error("Clave de almacenamiento local fuera del directorio permitido.");
  return target;
}

class LocalStorageProvider implements ObjectStorageProvider {
  readonly name = "local" as const;
  readonly bucket = "local-private";
  private readonly root = resolve(/* turbopackIgnore: true */ process.env.OBJECT_STORAGE_LOCAL_DIR?.trim() || ".object-storage");

  async put(key: string, body: Buffer) {
    const target = safeLocalPath(this.root, key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body, { flag: "wx" });
  }

  read(key: string) { return readFile(safeLocalPath(this.root, key)); }

  async delete(key: string) {
    try { await unlink(safeLocalPath(this.root, key)); }
    catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
  }

  async signedReadUrl() { return null; }
}

class GcsStorageProvider implements ObjectStorageProvider {
  readonly name = "gcs" as const;
  readonly bucket = required("GCS_BUCKET");
  private readonly storage = new Storage(process.env.GOOGLE_CLOUD_PROJECT ? { projectId: process.env.GOOGLE_CLOUD_PROJECT } : undefined);

  async put(key: string, body: Buffer, mimeType: string, metadata: Record<string, string>) {
    await this.storage.bucket(this.bucket).file(key).save(body, { resumable: false, contentType: mimeType, metadata: { metadata }, preconditionOpts: { ifGenerationMatch: 0 } });
  }

  async read(key: string) {
    const [body] = await this.storage.bucket(this.bucket).file(key).download();
    return body;
  }

  async delete(key: string) { await this.storage.bucket(this.bucket).file(key).delete({ ignoreNotFound: true }); }

  async signedReadUrl(key: string, filename: string, mimeType: string, ttlSeconds: number) {
    const [url] = await this.storage.bucket(this.bucket).file(key).getSignedUrl({ version: "v4", action: "read", expires: Date.now() + ttlSeconds * 1_000, responseDisposition: `attachment; filename="${filename}"`, responseType: mimeType });
    return url;
  }
}

class S3StorageProvider implements ObjectStorageProvider {
  readonly name = "s3" as const;
  readonly bucket = required("S3_BUCKET");
  private readonly client = new S3Client({
    region: process.env.S3_REGION?.trim() || "us-east-1",
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } : undefined,
  });

  async put(key: string, body: Buffer, mimeType: string, metadata: Record<string, string>) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: mimeType, Metadata: metadata }));
  }

  async read(key: string) {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!response.Body) throw new Error("El objeto S3 no devolvió contenido.");
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async delete(key: string) { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })); }

  signedReadUrl(key: string, filename: string, mimeType: string, ttlSeconds: number) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key, ResponseContentDisposition: `attachment; filename="${filename}"`, ResponseContentType: mimeType }), { expiresIn: ttlSeconds });
  }
}

let cachedProvider: ObjectStorageProvider | null = null;

export function objectStorageProvider() {
  if (cachedProvider) return cachedProvider;
  const configured = process.env.OBJECT_STORAGE_PROVIDER?.trim().toLowerCase();
  const name = configured || (process.env.NODE_ENV === "production" ? "" : "local");
  if (name === "local") cachedProvider = new LocalStorageProvider();
  else if (name === "gcs") cachedProvider = new GcsStorageProvider();
  else if (name === "s3") cachedProvider = new S3StorageProvider();
  else throw new Error("OBJECT_STORAGE_PROVIDER debe ser local, gcs o s3; en producción es obligatorio configurarlo.");
  return cachedProvider;
}

export function storageConfiguration() {
  const provider = objectStorageProvider();
  return { provider: provider.name, bucket: provider.bucket };
}
