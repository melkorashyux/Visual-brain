import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/auth";

// Checks a key + model before saving them. models.retrieve needs a valid key
// and an existing model, and generates no tokens, so testing costs nothing.
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  if (!apiKey || !model) {
    return NextResponse.json({ error: "Enter an API key" }, { status: 400 });
  }

  try {
    await new Anthropic({ apiKey, maxRetries: 0, timeout: 15_000 }).models.retrieve(model);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: describeError(err, model) }, { status: 400 });
  }
}

function describeError(err: unknown, model: string): string {
  if (err instanceof Anthropic.AuthenticationError) return "That API key isn't valid.";
  if (err instanceof Anthropic.PermissionDeniedError) {
    return "This key doesn't have access to the API. Check it in the Anthropic Console.";
  }
  if (err instanceof Anthropic.NotFoundError) return `Model "${model}" wasn't found.`;
  if (err instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach Anthropic. Check your internet connection.";
  }
  if (err instanceof Anthropic.APIError) return err.message;
  return "Something went wrong testing the key.";
}
