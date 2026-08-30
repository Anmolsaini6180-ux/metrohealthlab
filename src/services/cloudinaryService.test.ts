import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALLOWED_IMAGE_TYPES,
  CloudinaryUploadError,
  MAX_IMAGE_BYTES,
  getCloudinaryConfig,
  isCloudinaryConfigured,
  uploadToCloudinary,
} from "@/services/cloudinaryService";

// A File the Node test environment can build without the DOM's File.
function fakeFile(name: string, type: string, size: number): File {
  return { name, type, size } as File;
}

function setEnv(cloudName?: string, preset?: string) {
  vi.stubEnv("VITE_CLOUDINARY_CLOUD_NAME", cloudName ?? "");
  vi.stubEnv("VITE_CLOUDINARY_UPLOAD_PRESET", preset ?? "");
}

// Minimal XMLHttpRequest stand-in that lets each test drive the outcome.
class FakeXhr {
  static last: FakeXhr | null = null;
  upload = { onprogress: null as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 200;
  responseText = "{}";
  method = "";
  url = "";
  sent: FormData | null = null;

  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  send(body: FormData) {
    this.sent = body;
  }
  abort() {
    this.onabort?.();
  }
}

beforeEach(() => {
  setEnv("demo-cloud", "metro_unsigned");
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  FakeXhr.last = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("configuration", () => {
  it("reads both public variables", () => {
    expect(getCloudinaryConfig()).toEqual({ cloudName: "demo-cloud", uploadPreset: "metro_unsigned" });
    expect(isCloudinaryConfigured()).toBe(true);
  });

  it("reports not-configured when either value is missing or blank", () => {
    setEnv("demo-cloud", "");
    expect(isCloudinaryConfigured()).toBe(false);
    setEnv("", "metro_unsigned");
    expect(isCloudinaryConfigured()).toBe(false);
    setEnv("   ", "   ");
    expect(isCloudinaryConfigured()).toBe(false);
  });

  it("fails with a specific reason instead of attempting an upload", async () => {
    setEnv("", "");
    await expect(uploadToCloudinary(fakeFile("a.png", "image/png", 10))).rejects.toMatchObject({
      kind: "NOT_CONFIGURED",
    });
    expect(FakeXhr.last).toBeNull();
  });
});

describe("client-side validation", () => {
  it("rejects a disallowed file type before touching the network", async () => {
    await expect(uploadToCloudinary(fakeFile("x.pdf", "application/pdf", 10))).rejects.toMatchObject({
      kind: "INVALID_TYPE",
    });
    expect(FakeXhr.last).toBeNull();
  });

  it("rejects an oversized file before touching the network", async () => {
    await expect(uploadToCloudinary(fakeFile("big.png", "image/png", MAX_IMAGE_BYTES + 1))).rejects.toMatchObject({
      kind: "TOO_LARGE",
    });
    expect(FakeXhr.last).toBeNull();
  });

  it("accepts every type the preset is documented to allow", () => {
    expect(ALLOWED_IMAGE_TYPES).toContain("image/png");
    expect(ALLOWED_IMAGE_TYPES).toContain("image/jpeg");
    expect(ALLOWED_IMAGE_TYPES).toContain("image/webp");
    expect(ALLOWED_IMAGE_TYPES).toContain("image/svg+xml");
  });
});

describe("the upload request", () => {
  it("posts to the account's unsigned endpoint and never sends a secret", async () => {
    const promise = uploadToCloudinary(fakeFile("logo.png", "image/png", 1000), { folder: "metro-health/branding" });
    const xhr = FakeXhr.last!;
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("https://api.cloudinary.com/v1_1/demo-cloud/image/upload");

    // Assert the preset went and that no signature/api_key/timestamp
    // ever did — those only exist in the signed, server-side flow.
    const keys = [...(xhr.sent as FormData).keys()];
    expect(keys).toContain("upload_preset");
    expect(keys).toContain("file");
    expect(keys).toContain("folder");
    expect(keys).not.toContain("api_key");
    expect(keys).not.toContain("signature");
    expect(keys).not.toContain("timestamp");

    xhr.status = 200;
    xhr.responseText = JSON.stringify({
      secure_url: "https://res.cloudinary.com/demo-cloud/image/upload/v1/metro-health/branding/logo.png",
      public_id: "metro-health/branding/logo",
      resource_type: "image",
      format: "png",
      bytes: 1000,
      width: 512,
      height: 512,
      original_filename: "logo",
    });
    xhr.onload!();

    await expect(promise).resolves.toMatchObject({
      secureUrl: "https://res.cloudinary.com/demo-cloud/image/upload/v1/metro-health/branding/logo.png",
      publicId: "metro-health/branding/logo",
      format: "png",
      bytes: 1000,
      width: 512,
      height: 512,
      originalFilename: "logo",
    });
  });

  it("reports progress while uploading", async () => {
    const seen: number[] = [];
    const promise = uploadToCloudinary(fakeFile("a.png", "image/png", 100), { onProgress: (p) => seen.push(p) });
    const xhr = FakeXhr.last!;
    xhr.upload.onprogress!({ lengthComputable: true, loaded: 50, total: 100 });
    xhr.upload.onprogress!({ lengthComputable: true, loaded: 100, total: 100 });
    expect(seen).toEqual([50, 100]);

    xhr.responseText = JSON.stringify({ secure_url: "u", public_id: "p" });
    xhr.onload!();
    await promise;
  });

  it("surfaces Cloudinary's own rejection message", async () => {
    const promise = uploadToCloudinary(fakeFile("a.png", "image/png", 100));
    const xhr = FakeXhr.last!;
    xhr.status = 400;
    xhr.responseText = JSON.stringify({ error: { message: "Upload preset not found" } });
    xhr.onload!();
    await expect(promise).rejects.toMatchObject({ kind: "REJECTED" });
    await expect(promise).rejects.toThrow(/Upload preset not found/);
  });

  it("turns a transport failure into a retryable network error", async () => {
    const promise = uploadToCloudinary(fakeFile("a.png", "image/png", 100));
    FakeXhr.last!.onerror!();
    await expect(promise).rejects.toMatchObject({ kind: "NETWORK" });
  });

  it("rejects a malformed success body rather than returning a broken URL", async () => {
    const promise = uploadToCloudinary(fakeFile("a.png", "image/png", 100));
    const xhr = FakeXhr.last!;
    xhr.status = 200;
    xhr.responseText = JSON.stringify({ nothing: true });
    xhr.onload!();
    await expect(promise).rejects.toBeInstanceOf(CloudinaryUploadError);
  });

  it("can be cancelled", async () => {
    const controller = new AbortController();
    const promise = uploadToCloudinary(fakeFile("a.png", "image/png", 100), { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ kind: "ABORTED" });
  });
});
