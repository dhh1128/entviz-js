#!/usr/bin/env python3
"""Cut an entviz-js release: bump version, run the gate, commit, push, tag.

HUMAN-run by default: pushes to main and tags are reserved for a human
maintainer. An AI agent may run this script ONLY when a human has explicitly
instructed it to cut a release.

The version follows the entviz-family spec-tracking convention: 0.<spec-major>.x
means "this port is compliant with entviz spec v<spec-major>" (so 0.10.x ⇒ spec
v10, matching the Python reference's 0.10.0). A spec bump (v7 → v10) is therefore
a MINOR bump here (cut with --minor / --set); patch covers port-only changes
within a spec version. SPEC_VERSION lives in packages/core/src/entviz.ts. The
script warns if the new minor disagrees with SPEC_VERSION, and if the sibling
entviz reference (../entviz) is on a newer spec than this port claims.

Both workspace packages (@entviz/core, @entviz/react) are versioned in LOCKSTEP:
each release sets both to the same X.Y.Z and pins @entviz/react's dependency on
@entviz/core to that exact version. @entviz/core's manifest version is the
single source of truth this script reads.

Usage:
    python scripts/release.py                       # patch bump, default message
    python scripts/release.py -m "fix overlay"      # patch bump, custom message
    python scripts/release.py --minor -m "spec v10" # minor bump (e.g. spec bump)
    python scripts/release.py --major -m "1.0"      # major bump
    python scripts/release.py --set 0.10.0 -m "..." # set an explicit version
                                                    #   (must be > current; a
                                                    #    major jump > 1 needs
                                                    #    --allow-major-jump)

After the tag reaches GitHub, .github/workflows/release.yml runs the gate,
verifies the tag matches the manifest, and publishes @entviz/core to npm via
OIDC trusted publishing (no stored token).
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
CORE_PKG = REPO_ROOT / "packages" / "core" / "package.json"
REACT_PKG = REPO_ROOT / "packages" / "react" / "package.json"
# The private playground app pins both workspace packages exactly; its pins must
# move in lockstep with a release or `npm install --package-lock-only` cannot
# resolve the just-bumped version (it is not on the registry). Its OWN version
# stays put (private, 0.0.0) — only its @entviz/* dependency pins are rewritten.
PLAYGROUND_PKG = REPO_ROOT / "apps" / "playground" / "package.json"
CORE_SRC = REPO_ROOT / "packages" / "core" / "src" / "entviz.ts"
ENTVIZ_REF = REPO_ROOT.parent / "entviz"
CORE_NAME = "@entviz/core"
REACT_NAME = "@entviz/react"


def run(cmd, *, capture=False, check=True):
    return subprocess.run(cmd, capture_output=capture, text=True, check=check, cwd=REPO_ROOT)


def get(cmd):
    return run(cmd, capture=True).stdout.strip()


def current_version():
    v = json.loads(CORE_PKG.read_text()).get("version", "")
    if not re.fullmatch(r"\d+\.\d+\.\d+", v):
        sys.exit(f"Could not read a valid X.Y.Z version from {CORE_PKG} (got {v!r}).")
    return v


def _pin_internal_deps(data, new_version):
    """Rewrite any @entviz/core or @entviz/react entry in `data.dependencies`
    to the exact new version (in place). No-op when neither is depended on."""
    deps = data.get("dependencies")
    if isinstance(deps, dict):
        for name in (CORE_NAME, REACT_NAME):
            if name in deps:
                deps[name] = new_version


def set_version(new_version):
    """Bump the two published packages in lockstep, keep every internal
    @entviz/* pin exact, and move the private playground app's pins too.

    @entviz/core and @entviz/react get the new version as their OWN version and
    have their internal pins rewritten. The playground (apps/playground) is
    private at a fixed 0.0.0, so its version is left alone, but its exact pins on
    @entviz/core/@entviz/react MUST be bumped or `npm install --package-lock-only`
    fails to resolve the just-bumped version (it is not published). json
    round-trips preserve key order and the 2-space manifest format.

    ensure_ascii=False keeps the em-dashes in descriptions literal (as
    npm/JSON.stringify wrote them), so the release diff stays version-only."""
    for path in (CORE_PKG, REACT_PKG):
        data = json.loads(path.read_text())
        data["version"] = new_version
        _pin_internal_deps(data, new_version)
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    # Private workspace consumers: pins only, version untouched.
    for path in (PLAYGROUND_PKG,):
        data = json.loads(path.read_text())
        _pin_internal_deps(data, new_version)
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def bump(version, part):
    major, minor, patch = (int(x) for x in version.split("."))
    if part == "major":
        return f"{major + 1}.0.0"
    if part == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


def parse_explicit_version(value, current, *, allow_major_jump=False):
    if not re.fullmatch(r"\d+\.\d+\.\d+", value):
        sys.exit(f"--set expects X.Y.Z (got {value!r}).")
    as_tuple = lambda v: tuple(int(p) for p in v.split("."))  # noqa: E731
    new, cur = as_tuple(value), as_tuple(current)
    if new <= cur:
        sys.exit(f"--set {value} is not greater than current {current}; refusing to downgrade.")
    if new[0] - cur[0] > 1 and not allow_major_jump:
        sys.exit(
            f"--set {value} raises the major version by more than one step — "
            f"almost always a typo. Re-run with --allow-major-jump if intentional."
        )
    return value


def spec_version_of(path, pattern):
    try:
        m = re.search(pattern, path.read_text())
        return m.group(1) if m else None
    except OSError:
        return None


def our_spec_major():
    return spec_version_of(CORE_SRC, r'SPEC_VERSION\s*=\s*"v(\d+)"')


def warn_if_minor_disagrees(new_version):
    """The convention ties the minor to the spec major; remind (don't block)
    if a release would break that — e.g. a spec bump cut as --patch."""
    ours = our_spec_major()
    minor = new_version.split(".")[1]
    if ours and minor != ours:
        print(
            f"\n  ⚠️  version/spec mismatch: {new_version} has minor {minor}, but "
            f"SPEC_VERSION is v{ours}.\n      The convention is 0.<spec-major>.x — a "
            f"spec bump should be a --minor (or --set) release.\n"
        )


def warn_if_behind_spec():
    """Surface the case where the reference spec is ahead of this port."""
    ours = our_spec_major()
    ref = spec_version_of(ENTVIZ_REF / "src" / "entviz" / "__init__.py",
                          r'SPEC_VERSION\s*=\s*"v(\d+)"')
    if ours and ref and int(ref) > int(ours):
        print(
            f"\n  ⚠️  spec drift: the entviz reference is on spec v{ref}, but this "
            f"port targets v{ours}.\n      Releasing now ships a port that is behind "
            f"the spec. Upgrade first, or release knowingly.\n"
        )


def check_branch():
    branch = get(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    if branch != "main":
        sys.exit(f"Must be on main branch (currently on {branch!r}).")


def check_clean():
    if run(["git", "status", "--porcelain"], capture=True).stdout.strip():
        sys.exit("Working tree is not clean. Commit or stash changes first.")


def check_in_sync():
    run(["git", "fetch", "--quiet"])
    if get(["git", "rev-parse", "HEAD"]) != get(["git", "rev-parse", "origin/main"]):
        ahead = get(["git", "rev-list", "--count", "origin/main..HEAD"])
        behind = get(["git", "rev-list", "--count", "HEAD..origin/main"])
        sys.exit(
            f"Local main is not in sync with origin/main "
            f"({ahead} ahead, {behind} behind). Push or pull first."
        )


def run_gate():
    """The same gate CI enforces."""
    print("Running the gate (npm test across the workspace)...")
    run(["npm", "test", "--workspaces", "--if-present"])


def prompt_message(part):
    if not sys.stdin.isatty():
        sys.exit(f"--{part} release requires a commit message; pass -m '<message>'.")
    try:
        msg = input(f"Commit message for {part} release: ").strip()
    except (EOFError, KeyboardInterrupt):
        sys.exit("\nAborted.")
    if not msg:
        sys.exit("Commit message cannot be empty.")
    return msg


def main():
    parser = argparse.ArgumentParser(
        description="Cut a release. Defaults to --patch if no bump flag is given.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    group = parser.add_mutually_exclusive_group(required=False)
    group.add_argument("--major", dest="part", action="store_const", const="major")
    group.add_argument("--minor", dest="part", action="store_const", const="minor")
    group.add_argument("--patch", dest="part", action="store_const", const="patch")
    group.add_argument("--set", dest="explicit", metavar="X.Y.Z", default=None,
                       help="set an explicit version instead of bumping; must be > current")
    parser.add_argument("--allow-major-jump", action="store_true",
                        help="permit --set to raise the major version by more than one step")
    parser.add_argument("-m", dest="message", default=None, help="commit message")
    args = parser.parse_args()

    old = current_version()
    if args.explicit:
        new = parse_explicit_version(args.explicit, old, allow_major_jump=args.allow_major_jump)
        label = "set"
    else:
        label = args.part or "patch"
        new = bump(old, label)

    if args.message:
        message = args.message
    elif label == "patch":
        message = "misc fixes/enhancements"
    else:
        message = prompt_message(label)

    check_branch()
    check_clean()
    check_in_sync()
    warn_if_minor_disagrees(new)
    warn_if_behind_spec()
    run_gate()

    tag = f"v{new}"
    verb = "Setting" if args.explicit else "Bumping"
    print(f"{verb} {old} -> {new}")
    set_version(new)
    # Refresh package-lock.json so its recorded versions track the manifests
    # (does not upgrade dependencies).
    run(["npm", "install", "--package-lock-only", "--no-audit", "--no-fund"])

    run(["git", "add",
         "packages/core/package.json", "packages/react/package.json",
         "apps/playground/package.json", "package-lock.json"])
    run(["git", "commit", "-s", "-m", f"Release {tag}: {message}"])
    run(["git", "push", "origin", "main"])
    run(["git", "tag", "-a", tag, "-m", f"Release {tag}: {message}"])
    run(["git", "push", "origin", tag])

    print(f"Tagged and pushed {tag}. The release workflow will gate + publish to npm (OIDC).")


if __name__ == "__main__":
    main()
