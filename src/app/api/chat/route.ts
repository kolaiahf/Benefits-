import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getUserId } from "@/lib/session";
import { getBootstrap } from "@/lib/bootstrap";
import { buildGrounding, SYSTEM_PROMPT } from "@/lib/grounding";

export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(40),
});

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  // No key configured → tell the client to use its on-device fallback engine.
  if (!apiKey) return NextResponse.json({ error: "ai_unconfigured" }, { status: 503 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  // Anthropic requires the first message to be from the user; drop any
  // leading assistant turns (e.g. the app's greeting bubble).
  const msgs = [...parsed.data.messages];
  while (msgs.length && msgs[0].role === "assistant") msgs.shift();
  if (!msgs.length) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const data = await getBootstrap(userId);
  const system = `${SYSTEM_PROMPT}\n\n${buildGrounding(data)}`;

  try {
    const client = new Anthropic({ apiKey });
    const completion = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
      max_tokens: 600,
      system,
      messages: msgs.map((m) => ({ role: m.role, content: m.content })),
    });
    const text = completion.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return NextResponse.json({ text });
  } catch (err) {
    console.error("chat error", err);
    // Surface as 502 so the client falls back to the on-device engine.
    return NextResponse.json({ error: "ai_error" }, { status: 502 });
  }
}
