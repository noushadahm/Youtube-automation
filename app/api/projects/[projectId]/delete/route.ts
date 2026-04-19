import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getEnv } from "@/lib/env";

/**
 * Delete a project + all its scenes / assets / render jobs.
 *
 * Also best-effort deletes the project's folder in Supabase Storage so we
 * don't leak space. Cascade deletes in Postgres are handled by the Prisma
 * schema's `onDelete: Cascade` relations.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await requireUser();
    const project = await db.project.findFirst({
      where: { id: params.projectId, userId: user.id }
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Best-effort Storage cleanup before we drop the DB rows. If this fails
    // (e.g. network), the DB delete still proceeds so the user isn't stuck
    // with a zombie project.
    try {
      const supabase = getSupabaseServiceClient();
      const env = getEnv();
      const prefix = `projects/${params.projectId}/`;
      // Listing with a recursive walk since Supabase Storage list() is
      // non-recursive. We iterate known subfolders instead.
      const subfolders = ["images", "audio", "music", "renders", "shorts", "subtitles", "covers", "ai-clips", "variants"];
      for (const sub of subfolders) {
        const { data } = await supabase.storage
          .from(env.supabaseStorageBucket)
          .list(prefix + sub, { limit: 1000 });
        if (!data?.length) continue;
        const paths = data.map((f) => `${prefix}${sub}/${f.name}`);
        await supabase.storage.from(env.supabaseStorageBucket).remove(paths);
      }
    } catch (err) {
      console.warn("[project-delete] storage cleanup partial failure:", err);
    }

    await db.project.delete({ where: { id: project.id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[project-delete] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete project" },
      { status: 500 }
    );
  }
}
