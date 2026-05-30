// After `next build` with output:"standalone", Next copies the traced server
// files but (under the Turbopack build) MISSES some runtime deps that are only
// reached through our server route handlers (mysql2, bcryptjs and their trees),
// and it never copies the static assets / public folder.
//
// This script fixes both so `node .next/standalone/server.js` runs standalone:
//   1. copies .next/static and public/ into the bundle
//   2. copies a small allow-list of runtime packages + their dependency trees
import { cp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const projModules = path.join(root, "node_modules");
const destModules = path.join(standalone, "node_modules");

if (!existsSync(standalone)) {
  console.error(
    "[copy-standalone] .next/standalone not found. Did `next build` run with output:'standalone'?",
  );
  process.exit(0);
}

async function copyDir(src, dest) {
  if (!existsSync(src)) return;
  await cp(src, dest, { recursive: true });
}

// ---- static assets + public ----
await copyDir(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
console.log("[copy-standalone] copied .next/static");
await copyDir(path.join(root, "public"), path.join(standalone, "public"));
console.log("[copy-standalone] copied public");

// ---- runtime packages the tracer missed, plus their dependency trees ----
// Server code statically imports these but they weren't traced into standalone.
const ROOT_PACKAGES = ["mysql2", "bcryptjs"];
const copied = new Set();

/** Resolves a package dir, preferring a nested copy under `fromDir`. */
function resolvePkgDir(name, fromDir) {
  const nested = path.join(fromDir, "node_modules", name);
  if (existsSync(path.join(nested, "package.json"))) return nested;
  const top = path.join(projModules, name);
  if (existsSync(path.join(top, "package.json"))) return top;
  return null;
}

async function copyPkg(name, fromDir) {
  const srcDir = resolvePkgDir(name, fromDir);
  if (!srcDir) return; // optional/peer dep not installed; skip
  if (copied.has(srcDir)) return;
  copied.add(srcDir);

  // Mirror the package at its top-level location in the bundle.
  const destDir = path.join(destModules, name);
  if (!existsSync(destDir)) await copyDir(srcDir, destDir);

  // Recurse into its declared dependencies.
  try {
    const pkg = JSON.parse(await readFile(path.join(srcDir, "package.json"), "utf8"));
    const deps = Object.keys(pkg.dependencies ?? {});
    for (const dep of deps) await copyPkg(dep, srcDir);
  } catch {
    /* ignore unreadable package.json */
  }
}

for (const name of ROOT_PACKAGES) await copyPkg(name, root);
console.log(`[copy-standalone] bundled ${copied.size} runtime packages (mysql2/bcryptjs + deps)`);
console.log("[copy-standalone] done");
