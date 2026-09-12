import { handleIntakeRequest } from "@/lib/intake-api";
import type { IntakeEnvironment } from "@/types/intake-storage";
import { createSupportChatHandler } from "@/lib/support-chat";
/** Cloudflare Worker entry point for the vinext-starter template. */
import {
  handleImageOptimization,
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env extends IntakeEnvironment {
  OPENAI_API_KEY?: string;
  OPENAI_SUPPORT_MODEL?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/support-chat") {
      return supportHandler(request, {
        apiKey: env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
        model: env.OPENAI_SUPPORT_MODEL ?? process.env.OPENAI_SUPPORT_MODEL,
      });
    }
    if (url.pathname === "/api/intake" || url.pathname.startsWith("/api/intake/")) {
      return handleIntakeRequest(request, env, {
        apiKey: env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
        model: env.OPENAI_SUPPORT_MODEL ?? process.env.OPENAI_SUPPORT_MODEL,
      });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;

// One budget per worker; credentials are passed only for the current request.
const supportHandler = createSupportChatHandler(() => ({}));
