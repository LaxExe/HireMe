import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const latex: string | undefined = body?.latex;
    if (!latex || typeof latex !== "string") {
      return NextResponse.json({ error: "Missing LaTeX source" }, { status: 400 });
    }

    const usesFontspec = /\\usepackage(?:\[[^\]]*\])?\{fontspec\}|\\babelfont/.test(latex);
    const engine = usesFontspec ? "lualatex" : "pdflatex";

    const form = new FormData();
    form.append("filecontents[]", latex);
    form.append("filename[]", "document.tex");
    form.append("engine", engine);
    form.append("return", "pdf");

    const response = await fetch("https://texlive.net/cgi-bin/latexcgi", {
      method: "POST",
      body: form,
      redirect: "follow",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `LaTeX compilation upstream status ${response.status}` },
        { status: 502 }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Verify %PDF magic header
    if (
      bytes.length < 5 ||
      bytes[0] !== 0x25 ||
      bytes[1] !== 0x50 ||
      bytes[2] !== 0x44 ||
      bytes[3] !== 0x46
    ) {
      const logPreview = new TextDecoder().decode(bytes.slice(0, 1200));
      return NextResponse.json(
        { error: "LaTeX compilation did not return a PDF", log: logPreview },
        { status: 422 }
      );
    }

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Failed to compile LaTeX PDF:", err);
    return NextResponse.json({ error: "Failed to compile LaTeX PDF" }, { status: 500 });
  }
}
