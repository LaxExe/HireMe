import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { JUDGE_SYSTEM, PROMPT_VERSION, DRAFT_SYSTEM, SYSTEM } from "@/lib/resume/larp/llm";

const MODEL =
  process.env.LARP_MODEL ?? process.env.LARP_LLM_MODEL ?? "gemini-3.5-flash-lite";
const cache = new Map<string, string>(); // per-instance; use Redis/KV if you deploy serverless

// Per-client sliding-window rate limiter (max 30 uncached LLM calls per 60 seconds)
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

const ALLOWED_SYSTEM_PROMPTS = new Set([SYSTEM, DRAFT_SYSTEM, JUDGE_SYSTEM]);

function getClientKey(req: Request, uid?: string): string {
  if (uid) return `uid:${uid}`;
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "local";
  return `ip:${ip}`;
}

function checkRateLimit(clientKey: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(clientKey);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(clientKey, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  bucket.count++;
  return true;
}

function verifyJwtStructure(authHeader: string | null): string | undefined {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return undefined;
  const token = authHeader.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    ) as { user_id?: string; sub?: string; exp?: number; aud?: string };
    if (payload.exp && payload.exp * 1000 < Date.now()) return undefined;
    const expectedProj = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (expectedProj && payload.aud && payload.aud !== expectedProj) return undefined;
    return payload.user_id || payload.sub;
  } catch {
    return undefined;
  }
}

export async function POST(req: Request) {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "LLM not configured" }, { status: 503 });
  }

  // 1. Origin / Same-Site protection against external cross-site abuse
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        return NextResponse.json({ error: "forbidden origin" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "invalid origin" }, { status: 403 });
    }
  }

  // 2. Verify Firebase Auth ID token when Firebase is configured on non-localhost
  const uid = verifyJwtStructure(req.headers.get("authorization"));
  const isLocalhost = !host || host.startsWith("localhost") || host.startsWith("127.0.0.1");
  if (!isLocalhost && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && !uid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { system, user, temperature = 0.7 } = await req.json().catch(() => ({}));
  if (
    typeof system !== "string" ||
    typeof user !== "string" ||
    user.length > 8000 ||
    system.length > 8000
  ) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // 3. System prompt allowlist: prevents anyone from using /api/larp/propose as a general-purpose chatbot proxy
  if (!ALLOWED_SYSTEM_PROMPTS.has(system)) {
    return NextResponse.json({ error: "disallowed system prompt" }, { status: 403 });
  }

  // 4. Check SHA-256 cache before consuming rate limit or tokens
  const key = createHash("sha256")
    .update([MODEL, PROMPT_VERSION, system, user, temperature].join("|"))
    .digest("hex");
  const hit = cache.get(key);
  if (hit) {
    return NextResponse.json({ text: hit, cached: true });
  }

  // 5. Enforce per-user / per-IP rate limit (30 uncached requests / minute)
  const clientKey = getClientKey(req, uid);
  if (!checkRateLimit(clientKey)) {
    return NextResponse.json({ error: "rate limit exceeded" }, { status: 429 });
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
