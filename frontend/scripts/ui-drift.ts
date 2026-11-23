/**
 * Tracks the shadcn-svelte components in src/lib/components/ui, which are generated files that we
 * own. The CLI has no `diff` command and rewrites parts of what it fetches (alias paths, icons,
 * style classes), so comparing the registry against the files on disk reports false drift. Instead
 * this records a hash of both sides when the components are installed, and later compares each
 * side against its own record:
 *
 *   bun run ui:drift             report local edits and upstream updates
 *   bun run ui:drift -- --record store the current state as the baseline (run after `add -o`)
 *
 * The baseline lives in ui.lock.json, next to components.json.
 */
import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";

const UI_DIR = "src/lib/components/ui";
const LOCK = "ui.lock.json";

type Entry = { upstream: string; files: Record<string, string> };
type Lock = Record<string, Entry>;

const sha = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

const config = await Bun.file("components.json").json();
const aliases: Record<string, string> = {
  $UTILS$: config.aliases.utils,
  $UI$: config.aliases.ui,
  $LIB$: config.aliases.lib,
  $HOOKS$: config.aliases.hooks,
  $COMPONENTS$: config.aliases.components,
};

const names = (await readdir(UI_DIR, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const upstreamHash = async (name: string): Promise<string | null> => {
  const res = await fetch(`${config.registry}/styles/${config.style}/${name}.json`);
  if (!res.ok) return null;
  const item = (await res.json()) as { files: { content: string }[] };
  let content = item.files.map((file) => file.content).join("\n");
  for (const [placeholder, alias] of Object.entries(aliases)) content = content.replaceAll(placeholder, alias);
  return sha(content);
};

const localHashes = async (name: string): Promise<Record<string, string>> => {
  const files = (await readdir(`${UI_DIR}/${name}`)).sort();
  const entries = await Promise.all(files.map(async (file) => [file, sha(await Bun.file(`${UI_DIR}/${name}/${file}`).text())]));
  return Object.fromEntries(entries);
};

const record = Bun.argv.includes("--record");
const previous: Lock = (await Bun.file(LOCK).exists()) ? await Bun.file(LOCK).json() : {};
const next: Lock = {};
let problems = 0;

for (const name of names) {
  const [upstream, files] = await Promise.all([upstreamHash(name), localHashes(name)]);
  if (upstream === null) {
    console.log(`?  ${name}: not in the "${config.style}" registry`);
    continue;
  }
  next[name] = { upstream, files };
  if (record) continue;

  const base = previous[name];
  if (!base) {
    console.log(`?  ${name}: no baseline, run with --record`);
    problems++;
    continue;
  }
  const edited = Object.keys({ ...base.files, ...files }).filter((file) => base.files[file] !== files[file]);
  const outdated = base.upstream !== upstream;
  if (edited.length) console.log(`M  ${name}: edited locally (${edited.join(", ")})`);
  if (outdated) console.log(`U  ${name}: upstream changed, review with \`add -o ${name}\``);
  if (!edited.length && !outdated) console.log(`=  ${name}`);
  problems += Number(edited.length > 0 || outdated);
}

if (record) {
  await Bun.write(LOCK, JSON.stringify(next, null, 2) + "\n");
  console.log(`Recorded ${Object.keys(next).length} components (${config.style}) in ${LOCK}`);
} else {
  console.log(`\n${names.length} components, ${problems} need attention`);
  process.exit(problems ? 1 : 0);
}
