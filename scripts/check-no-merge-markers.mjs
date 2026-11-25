// Fail if unresolved git conflict markers remain in app sources.
import fs from "node:fs";
import path from "node:path";

const roots = ["components", "lib", "app"];
const markers = ["<<<<<<<", ">>>>>>>"];
const skip = new Set(["node_modules", ".next", ".git"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|ts|tsx|mjs|cjs|css|md|json)$/.test(name)) out.push(p);
  }
  return out;
}

const hits = [];
for (const root of roots) {
  for (const file of walk(root)) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of markers) {
      if (text.includes(m)) hits.push(`${file}: contains ${m}`);
    }
  }
}
if (hits.length) {
  console.error("Unresolved merge conflict markers:\n" + hits.join("\n"));
  process.exit(1);
}
console.log("merge markers ok");
