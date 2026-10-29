// Next's standalone output (.next/standalone) doesn't include the static
// assets or public folder by design — copy them in so the bundled server can
// serve the app on its own, with no other files from the repo needed.
// Per-install secrets (the extension token, the Anthropic key) are created
// or entered at runtime and live in the data dir, never in the build.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(standalone)) {
  console.error(
    "`.next/standalone` not found — run `next build` first (check next.config.ts has output: \"standalone\")."
  );
  process.exit(1);
}

fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), {
  recursive: true,
});
fs.cpSync(
  path.join(root, ".next", "static"),
  path.join(standalone, ".next", "static"),
  { recursive: true }
);

console.log("Copied public/ and .next/static into .next/standalone");
