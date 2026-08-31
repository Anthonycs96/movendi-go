import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";

const git = spawnSync("git", ["diff", "--cached", "--name-only", "-z"], { encoding: "buffer" });
if (git.status !== 0) {
  process.stderr.write(git.stderr);
  process.exit(git.status ?? 1);
}

const files = git.stdout.toString("utf8").split("\0").filter(Boolean);
const forbiddenPaths = [
  /(^|\/)\.env$/i,
  /(^|\/)\.env\.(?!example$)[^/]+$/i,
  /(^|\/)supabase\/\.temp\//i,
  /\.(?:db|db-journal|sqlite|sqlite3|pem|key|p12|pfx)$/i,
];
const contentRules = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["github-token", /gh[pousr]_[A-Za-z0-9]{20,}/],
  ["aws-access-key", /AKIA[0-9A-Z]{16}/],
  ["openai-key", /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ["stripe-secret", /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/],
  ["jwt", /eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/],
  ["database-credential", /(?:postgres|postgresql|mysql):\/\/[^\s:@/]+:[^\s@/]+@(?!127\.0\.0\.1(?::|\/)|localhost(?::|\/))/i],
];

const findings = [];
for (const file of files) {
  if (forbiddenPaths.some((pattern) => pattern.test(file))) findings.push({ file, rule: "forbidden-path" });
  let stat;
  try { stat = statSync(file); } catch { continue; }
  if (!stat.isFile() || stat.size > 5 * 1024 * 1024) continue;
  let content;
  try { content = readFileSync(file, "utf8"); } catch { continue; }
  for (const [rule, pattern] of contentRules) {
    if (pattern.test(content)) findings.push({ file, rule });
  }
}

if (findings.length) {
  console.error("Se detectaron posibles secretos en archivos preparados:");
  for (const finding of findings) console.error(`- ${finding.file} (${finding.rule})`);
  process.exit(1);
}

console.log(`Escaneo aprobado: ${files.length} archivos preparados, sin secretos de alta confianza.`);
