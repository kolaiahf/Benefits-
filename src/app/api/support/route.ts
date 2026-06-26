import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/session";
import { db } from "@/db";
import { supportMessages } from "@/db/schema";

const schema = z.object({
  topic: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
});

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  await db.insert(supportMessages).values({ userId, topic: parsed.data.topic, body: parsed.data.body });
  return NextResponse.json({ ok: true });
}
