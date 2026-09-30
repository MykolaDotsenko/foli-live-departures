import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

const forbiddenPaths = [
  "api",
  "server",
  "functions",
  "netlify/functions",
  "supabase/functions",
  "vercel.json",
  "netlify.toml",
  "serverless.yml",
  "serverless.yaml",
];

const forbiddenDependencies = new Set([
  "express",
  "fastify",
  "koa",
  "@hapi/hapi",
  "@nestjs/core",
  "serverless",
  "firebase-functions",
  "@vercel/node",
  "netlify-lambda",
]);

const failures = [];

for (const relativePath of forbiddenPaths) {
  if (fs.existsSync(path.join(root, relativePath))) {
    failures.push(
      `Backend/serverless artifact is not allowed by the static-PWA contract: ${relativePath}`
    );
  }
}

const pkg = readJson("package.json");
const dependencies = {
  ...(pkg.dependencies || {}),
  ...(pkg.devDependencies || {}),
  ...(pkg.optionalDependencies || {}),
};

for (const name of Object.keys(dependencies)) {
  if (forbiddenDependencies.has(name)) {
    failures.push(
      `Server dependency is not allowed by the static-PWA contract: ${name}`
    );
  }
}

const sourceRoots = ["src"];
const secretPattern =
  /(?:VITE_|import\.meta\.env\.)[^\n"'\s]*(?:SECRET|PRIVATE_KEY|CLIENT_SECRET)/i;

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return [absolute];
  });
}

for (const sourceRoot of sourceRoots) {
  for (const file of walk(path.join(root, sourceRoot))) {
    if (!/\.(?:js|jsx|mjs|ts|tsx)$/.test(file)) continue;
    const content = fs.readFileSync(file, "utf8");
    if (secretPattern.test(content)) {
      failures.push(
        `Potential confidential frontend credential reference found: ${path.relative(
          root,
          file
        )}`
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Backendless architecture verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Backendless architecture verified: static PWA, no server/serverless layer or confidential frontend credential references."
);
