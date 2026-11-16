import { NextResponse } from "next/server";
import { DEFAULT_LLM_MODEL, parseLlmRewritesJson } from "@/lib/resume/larp/llm";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { prompt?: string; model?: string };
    const prompt = body?.prompt?.trim();
    if (!prompt) {
      return NextResponse.json({ rewrites: [], error: "Missing prompt" }, { status: 400 });
    }

    const model = body?.model || process.env.LARP_LLM_MODEL || DEFAULT_LLM_MODEL;
    const geminiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!geminiKey && !openaiKey) {
      return NextResponse.json({
        rewrites: [],
        raw: '{"rewrites":[]}',
        model,
        notice: "No server-side LLM API key configured; falling back to deterministic rules.",
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      if (geminiKey) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            model
          )}:generateContent?key=${encodeURIComponent(geminiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.25,
                responseMimeType: "application/json",
              },
            }),
            signal: controller.signal,
          }
        );

        if (!res.ok) {
          return NextResponse.json({ rewrites: [], raw: '{"rewrites":[]}', model });
        }

        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{"rewrites":[]}';
        const rewrites = parseLlmRewritesJson(raw);
        return NextResponse.json({ rewrites, raw, model });
      }

      if (openaiKey) {
        const oaModel = process.env.LARP_LLM_MODEL || "gpt-4o-mini";
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: oaModel,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.25,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          return NextResponse.json({ rewrites: [], raw: '{"rewrites":[]}', model: oaModel });
        }

        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const raw = data?.choices?.[0]?.message?.content ?? '{"rewrites":[]}';
        const rewrites = parseLlmRewritesJson(raw);
        return NextResponse.json({ rewrites, raw, model: oaModel });
      }

      return NextResponse.json({ rewrites: [], raw: '{"rewrites":[]}', model });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return NextResponse.json({ rewrites: [], raw: '{"rewrites":[]}' });
  }
}
