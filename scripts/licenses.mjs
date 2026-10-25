import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
const base = process.cwd(),
  lock = JSON.parse(await readFile("package-lock.json", "utf8"));
let output =
  "# Installed npm dependency licenses\n\nGenerated from the locked packages and their installed license files.\n\n";
for (const [location, pkg] of Object.entries(lock.packages)) {
  if (!location) continue;
  const folder = path.join(base, location);
  let manifest;
  try {
    manifest = JSON.parse(
      await readFile(path.join(folder, "package.json"), "utf8"),
    );
  } catch {
    continue;
  }
  output +=
    "## " +
    manifest.name +
    " " +
    manifest.version +
    "\n\nDeclared license: " +
    JSON.stringify(manifest.license ?? "not declared") +
    "\n\n";
  const names = await readdir(folder);
  for (const name of names.filter((n) =>
    /^(licen[sc]e|copying|ofl)(\.|$|-)/i.test(n),
  )) {
    try {
      output += "\n" + (await readFile(path.join(folder, name), "utf8")) + "\n";
    } catch {}
  }
}
await writeFile("docs/NPM-LICENSES.md", output.split("\n").map(line => line.trimEnd()).join("\n").trimEnd() + "\n");
console.log("Generated docs/NPM-LICENSES.md");
