import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./tsLoader.mjs", pathToFileURL("./src/lib/resume/larp/__tests__/"));
