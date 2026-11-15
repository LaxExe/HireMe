import { NextResponse } from "next/server";

function cleanHtmlToText(html: string): string {
  // 1. Remove unwanted elements
  let text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "");

  // 2. Try to isolate main job description container if present
  const jdContainerRegex =
    /<(?:div|section|article|main)[^>]*(?:id|class|data-automation-id|data-qa)=["'][^"']*(?:job[-_]?description|job[-_]?posting|posting[-_]?page|description__text|jobDescriptionText|ashby-job-posting)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|article|main)>/i;
  const match = jdContainerRegex.exec(text);
  if (match && match[1] && match[1].length > 150) {
    text = match[1];
  }

  // 3. Convert breaks and lists to formatted text
  text = text
    .replace(/<(?:br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|h[1-6]|section|article)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/li>/gi, "");

  // 4. Strip all remaining tags
  text = text.replace(/<[^>]+>/g, " ");

  // 5. Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));

  // 6. Clean whitespace and consecutive newlines
  const lines = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0);

  let cleaned = lines.join("\n");
  if (cleaned.length > 15000) {
    cleaned = cleaned.slice(0, 15000) + "\n\n[Content truncated for length]";
  }
  return cleaned;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing or invalid url" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    const res = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(9000), // 9s timeout
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Remote job posting server returned HTTP ${res.status}` },
        { status: 502 }
      );
    }

    const html = await res.text();
    const jobDescription = cleanHtmlToText(html);

    if (!jobDescription || jobDescription.length < 50) {
      return NextResponse.json(
        { error: "Could not extract sufficient job description text from this URL" },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      jobDescription,
    });
  } catch (err: any) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    return NextResponse.json(
      {
        error: isTimeout
          ? "Request timed out while connecting to job posting URL"
          : err?.message || "Failed to extract job description",
      },
      { status: 500 }
    );
  }
}
