import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { PROMPT_VERSION } from "@/lib/resume/larp/llm";

const MODEL =
  process.env.LARP_MODEL ?? process.env.LARP_LLM_MODEL ?? "gemini-2.5-flash";
const cache = new Map<string, string>(); // per-instance; use Redis/KV if you deploy serverless

export async function POST(req: Request) {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "LLM not configured" }, { status: 503 });
  }

  const { system, user, temperature = 0.7 } = await req.json().catch(() => ({}));
  if (
    typeof system !== "string" ||
    typeof user !== "string" ||
    user.length > 4000 ||
    system.length > 4000
  ) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const key = createHash("sha256")
    .update([MODEL, PROMPT_VERSION, system, user, temperature].join("|"))
    .digest("hex");
  const hit = cache.get(key);
  if (hit) {
    return NextResponse.json({ text: hit, cached: true });
  }

  const t0 = Date.now();
  const call = () =>
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            temperature,
            responseMimeType: "application/json",
            maxOutputTokens: 350,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

  let res = await call();
  if (res.status === 429 || res.status >= 500) {
    await new Promise((r) => setTimeout(r, 600));
    res = await call();
  }
  if (!res.ok) {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }

  const data = await res.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const usage = data?.usageMetadata;
  const latencyMs = Date.now() - t0;
  console.info(
    "[larp] tokens",
    usage?.totalTokenCount,
    "model",
    MODEL,
    "promptVersion",
    PROMPT_VERSION,
    "latencyMs",
    latencyMs
  );
  if (text) cache.set(key, text);
  return NextResponse.json({ text });
}
