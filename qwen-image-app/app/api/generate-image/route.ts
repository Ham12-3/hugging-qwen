import { InferenceClient } from "@huggingface/inference";

export const runtime = "nodejs";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasArrayBuffer(
  value: unknown
): value is { arrayBuffer: () => Promise<ArrayBuffer>; type?: string } {
  return (
    isObject(value) &&
    typeof (value as { arrayBuffer?: unknown }).arrayBuffer === "function"
  );
}

function isDataUrl(str: string): boolean {
  return str.startsWith("data:image/");
}

function isHttpUrl(str: string): boolean {
  return str.startsWith("http://") || str.startsWith("https://");
}

function base64ToUint8Array(b64: string): Uint8Array {
  const buf = Buffer.from(b64, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const prompt: string = body?.prompt ?? "";
    const negative_prompt: string = body?.negative_prompt ?? "";
    const width: number = body?.width ?? 1024;
    const height: number = body?.height ?? 1024;

    if (!prompt.trim()) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    const token = process.env.HF_TOKEN;
    if (!token) {
      return Response.json(
        { error: "Missing HF_TOKEN in .env.local" },
        { status: 500 }
      );
    }

    const client = new InferenceClient(token);

    const out: unknown = await client.textToImage({
      provider: "replicate",
      model: "Qwen/Qwen-Image-2512",
      inputs: prompt,
      parameters: {
        negative_prompt,
        width,
        height,
        num_inference_steps: 30,
        guidance_scale: 4,
      },
    });

    if (hasArrayBuffer(out)) {
      const ab = await out.arrayBuffer();
      const contentType =
        typeof out.type === "string" && out.type.length > 0 ? out.type : "image/png";

      return new Response(ab, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-store",
        },
      });
    }

    if (typeof out === "string") {
      if (isDataUrl(out)) {
        const match = out.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
        if (!match) {
          return Response.json(
            { error: "Bad data URL returned from provider" },
            { status: 500 }
          );
        }

        const contentType = match[1];
        const b64 = match[2];

        return new Response(base64ToUint8Array(b64), {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "no-store",
          },
        });
      }

      if (isHttpUrl(out)) {
        const imgRes = await fetch(out);
        if (!imgRes.ok) {
          return Response.json(
            { error: `Failed to fetch generated image: ${imgRes.status}` },
            { status: 500 }
          );
        }

        const ab = await imgRes.arrayBuffer();
        const contentType = imgRes.headers.get("content-type") || "image/png";

        return new Response(ab, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "no-store",
          },
        });
      }

      return new Response(base64ToUint8Array(out), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
        },
      });
    }

    return Response.json(
      { error: "Unexpected provider output format", details: out },
      { status: 500 }
    );
  } catch (err: unknown) {
    return Response.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
