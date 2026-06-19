#!/usr/bin/env node
// Cut an entviz-js release: bump version, commit, push, tag, push tag.
//
// This is a HUMAN-run script. AGENTS.md reserves pushes to main and tags for
// humans; AI agents must not run this.
//
// The two workspace packages (@entviz/core, @entviz/react) are versioned in
// LOCKSTEP — every release bumps both to the same X.Y.Z, and @entviz/react's
// dependency on @entviz/core is pinned to that exact version. @entviz/core's
// version is the single source of truth that this script reads and bumps.
//
// VERSION POLICY: the MINOR component tracks the entviz spec MAJOR this port
// targets. The version is `0.<SPEC_MAJOR>.<patch>` where SPEC_MAJOR comes from
// SPEC_VERSION in packages/core/src/entviz.ts (e.g. "v7" -> 0.7.x). The minor
// is therefore DERIVED, never hand-typed:
//   * if the spec major advanced since the last release (the manifest's minor
//     differs from SPEC_VERSION), this is a SPEC release: 0.<SPEC_MAJOR>.0;
//   * otherwise it is a PATCH within the current spec: bump the last component.
// So porting to v10 (bump SPEC_VERSION to "v10") makes the next release 0.10.0
// automatically. To advance the spec major you must change SPEC_VERSION first.
//
// Usage:
//   node scripts/release.mjs                       # derive next version from SPEC_VERSION
//   node scripts/release.mjs -m "add foo"          # ... with a custom commit message
//   node scripts/release.mjs --set 1.0.0 -m "..."  # explicit override (escape hatch;
//                                                  #   must be > current, warns if its
//                                                  #   minor != the spec major)
//
// After the tag reaches GitHub, .github/workflows/release.yml verifies the tag
// matches the manifest version, runs the tests, and publishes to npm.

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { createInterface } from "node:readline";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORE_PKG = join(REPO_ROOT, "packages/core/package.json");
const REACT_PKG = join(REPO_ROOT, "packages/react/package.json");
const CORE_SRC = join(REPO_ROOT, "packages/core/src/entviz.ts");
const CORE_NAME = "@entviz/core";

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function run(cmd, args, { capture = false } = {}) {
  return execFileSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
}

function get(cmd, args) {
  return run(cmd, args, { capture: true }).trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function currentVersion() {
  const v = readJson(CORE_PKG).version;
  if (!/^\d+\.\d+\.\d+$/.test(v ?? "")) {
    die(`Could not read a valid X.Y.Z version from ${relative(REPO_ROOT, CORE_PKG)} (got ${v}).`);
  }
  return v;
}

// The spec major this port targets, read from SPEC_VERSION (e.g. "v7" -> 7).
function specMajor() {
  const m = readFileSync(CORE_SRC, "utf8").match(/SPEC_VERSION\s*=\s*"v(\d+)"/);
  if (!m) die(`Could not read SPEC_VERSION from ${relative(REPO_ROOT, CORE_SRC)}.`);
  return Number(m[1]);
}

function gt(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false; // equal
}

// Derive the next version from the spec major. Returns { version, kind } where
// kind is "spec" (the spec major advanced -> reset to 0.<specMajor>.0) or
// "patch" (still on the same spec -> bump the last component).
function nextAuto(current, specMaj) {
  const [major, minor, patch] = current.split(".").map(Number);
  if (minor !== specMaj) return { version: `${major}.${specMaj}.0`, kind: "spec" };
  return { version: `${major}.${minor}.${patch + 1}`, kind: "patch" };
}

function parseExplicit(value, current, specMaj) {
  if (!/^\d+\.\d+\.\d+$/.test(value)) die(`--set expects X.Y.Z (got ${value}).`);
  const [n, c] = [value, current].map((v) => v.split(".").map(Number));
  if (!gt(n, c)) die(`--set ${value} is not greater than current ${current}; refusing to downgrade.`);
  if (n[1] !== specMaj) {
    console.warn(
      `\n⚠  --set ${value} has minor ${n[1]} but the spec major is ${specMaj} ` +
        `(SPEC_VERSION="v${specMaj}").\n   The version policy ties the minor to the ` +
        `spec major; this override breaks that. Proceeding anyway.\n`,
    );
  }
  return value;
}

function checkBranch() {
  const branch = get("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "main") die(`Must be on main branch (currently on ${branch}).`);
}

function checkClean() {
  if (get("git", ["status", "--porcelain"])) {
    die("Working tree is not clean. Commit or stash changes first.");
  }
}

function checkInSync() {
  run("git", ["fetch", "--quiet"]);
  if (get("git", ["rev-parse", "HEAD"]) !== get("git", ["rev-parse", "origin/main"])) {
    const ahead = get("git", ["rev-list", "--count", "origin/main..HEAD"]);
    const behind = get("git", ["rev-list", "--count", "HEAD..origin/main"]);
    die(`Local main is not in sync with origin/main (${ahead} ahead, ${behind} behind). Push or pull first.`);
  }
}

function runTests() {
  console.log("Running tests (the gate CI enforces)...");
  run("npm", ["test", "--workspaces", "--if-present"]);
}

// Surface the situation the project cares about: the entviz spec / reference
// impl moving ahead of this port. Best-effort and non-fatal — it reads the
// sibling ../entviz checkout if present; absent that, it stays quiet.
function warnIfSpecBehind() {
  let ours;
  try {
    const src = readFileSync(join(REPO_ROOT, "packages/core/src/entviz.ts"), "utf8");
    ours = src.match(/SPEC_VERSION\s*=\s*"v(\d+)"/)?.[1];
  } catch {
    return;
  }
  let ref;
  try {
    const refSrc = readFileSync(join(REPO_ROOT, "../entviz/src/entviz/__init__.py"), "utf8");
    ref = refSrc.match(/SPEC_VERSION\s*=\s*"v(\d+)"/)?.[1];
  } catch {
    return; // no sibling reference checkout — nothing to compare against
  }
  if (ours === undefined || ref === undefined) return;
  if (Number(ref) > Number(ours)) {
    console.warn(
      `\n⚠  Spec drift: this port targets entviz spec v${ours}, but the reference ` +
        `impl at ../entviz is v${ref}.\n   You are releasing a port that is BEHIND the ` +
        `spec. CI's conformance job already warns about this; releasing is allowed, but\n` +
        `   make sure the version/changelog is honest about the spec level.\n`,
    );
  }
}

function setVersions(newVersion) {
  for (const path of [CORE_PKG, REACT_PKG]) {
    const pkg = readJson(path);
    pkg.version = newVersion;
    // Keep @entviz/react's pin on @entviz/core exact and in lockstep.
    if (pkg.dependencies?.[CORE_NAME]) pkg.dependencies[CORE_NAME] = newVersion;
    writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
  }
}

function prompt(question) {
  if (!process.stdin.isTTY) {
    die(`This release requires a commit message; pass -m '<message>'.`);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

function parseArgs(argv) {
  const opts = { explicit: null, message: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--set") {
      opts.explicit = argv[++i] ?? die("--set requires a version argument.");
    } else if (a === "-m") {
      opts.message = argv[++i] ?? die("-m requires a message argument.");
    } else {
      die(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const old = currentVersion();
  const specMaj = specMajor();

  // A "spec" release (the spec major advanced) is significant and wants a real
  // message, like a minor/major bump; a "patch" within the spec can default.
  let newVersion, kind;
  if (opts.explicit) {
    newVersion = parseExplicit(opts.explicit, old, specMaj);
    kind = "set";
  } else {
    ({ version: newVersion, kind } = nextAuto(old, specMaj));
  }

  let message = opts.message;
  if (!message) {
    message = kind === "patch" ? "misc fixes/enhancements" : await prompt(`Commit message for ${kind} release (v${newVersion}): `);
    if (!message) die("Commit message cannot be empty.");
  }

  checkBranch();
  checkClean();
  checkInSync();
  warnIfSpecBehind();
  runTests();

  const tag = `v${newVersion}`;
  console.log(`${opts.explicit ? "Setting" : "Bumping"} ${old} -> ${newVersion}`);
  setVersions(newVersion);

  // Refresh the lockfile so its recorded versions track the manifests.
  console.log("Refreshing package-lock.json...");
  run("npm", ["install", "--package-lock-only", "--no-audit", "--no-fund"]);

  run("git", ["add", "packages/core/package.json", "packages/react/package.json", "package-lock.json"]);
  // DCO sign-off (-s): this and all repos the maintainer works in require it.
  run("git", ["commit", "-s", "-m", `Release ${tag}: ${message}`]);
  run("git", ["push", "origin", "main"]);
  run("git", ["tag", "-a", tag, "-m", `Release ${tag}: ${message}`]);
  run("git", ["push", "origin", tag]);

  console.log(`\nTagged and pushed ${tag}. The release workflow will verify, test, and publish to npm.`);
}

main().catch((e) => die(e?.stack ?? String(e)));
