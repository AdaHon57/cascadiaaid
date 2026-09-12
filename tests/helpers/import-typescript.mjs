import { readFileSync } from "node:fs";
import ts from "typescript";

// Resolve application aliases for Node's native test runner, using the app compiler.
const cache = new Map();
function moduleUrl(path) {
  if (cache.has(path)) return cache.get(path);
  const source = readFileSync(new URL(`../../${path}.ts`, import.meta.url), "utf8");
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replace(/(["'])@\/([^"']+)\1/g, (_, quote, dependency) =>
      JSON.stringify(moduleUrl(dependency)),
    )
    .replace(
      /(from\s+|import\s*\()(["'])(pdf-lib|@pdf-lib\/fontkit)\2/g,
      (_, prefix, quote, name) => prefix + JSON.stringify(import.meta.resolve(name)),
    );
  const url = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  cache.set(path, url);
  return url;
}
export function importTypeScript(path) {
  return import(moduleUrl(path));
}
