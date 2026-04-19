import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getUserAiKeys } from "@/lib/user-keys";

/**
 * Returns the Gemini models your API key can call, filtered to the ones that
 * support generateContent (image / text). Useful for picking a valid value
 * for `geminiImageModel` when Google renames or deprecates a model.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const keys = await getUserAiKeys(user.id);
    if (!keys.geminiApiKey) {
      return NextResponse.json(
        { error: "Gemini API key not set in Settings." },
        { status: 400 }
      );
    }

    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models",
      { headers: { "x-goog-api-key": keys.geminiApiKey } }
    );
    const body = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: body?.error?.message ?? `Gemini list failed (${res.status})` },
        { status: res.status }
      );
    }

    const models = (body.models ?? []) as Array<{
      name: string;
      displayName?: string;
      supportedGenerationMethods?: string[];
      description?: string;
    }>;

    const genContent = models
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => ({
        id: m.name.replace(/^models\//, ""),
        displayName: m.displayName,
        description: m.description,
        // Heuristic: likely image-capable if name mentions "image"
        likelyImage: /image/i.test(m.name) || /image/i.test(m.displayName ?? "")
      }))
      .sort((a, b) => {
        if (a.likelyImage !== b.likelyImage) return a.likelyImage ? -1 : 1;
        return a.id.localeCompare(b.id);
      });

    return NextResponse.json({ models: genContent });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list models" },
      { status: 500 }
    );
  }
}
