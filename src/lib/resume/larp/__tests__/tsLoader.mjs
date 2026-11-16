import path from "node:path";
import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  let target = specifier;
  if (specifier.startsWith("@/")) {
    target = pathToFileURL(path.join(process.cwd(), "src", specifier.slice(2))).href;
  }

  try {
    return await nextResolve(target, context);
  } catch (err) {
    if (!target.endsWith(".ts") && !target.endsWith(".js") && !target.endsWith(".json")) {
      for (const ext of [".ts", ".tsx", "/index.ts", ".js"]) {
        try {
          if (target.startsWith("file://")) {
            return await nextResolve(target + ext, context);
          } else if (target.startsWith(".") && context.parentURL) {
            const resolvedUrl = new URL(target + ext, context.parentURL).href;
            return await nextResolve(resolvedUrl, context);
          }
        } catch {
          // try next extension
        }
      }
    }
    throw err;
  }
}
