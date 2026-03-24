export interface ParsedDependency {
  /** Crate name as it appears in Cargo.toml */
  name: string;
  /** Zero-based line number of the dependency declaration */
  line: number;
  /** True when the dependency uses a local `path = "..."` */
  isPathDep: boolean;
  /** True when the dependency uses a `git = "..."` source */
  isGitDep: boolean;
}

// Valid crate name characters per Cargo's rules.
const CRATE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

/** Returns true when the TOML section name starts a dependency table. */
function isDepSection(section: string): boolean {
  // Exact matches: [dependencies], [dev-dependencies], [build-dependencies],
  // [workspace.dependencies], [workspace.dev-dependencies].
  if (/^(?:workspace\.)?(?:dev-|build-)?dependencies$/.test(section)) {
    return true;
  }
  // Target-specific: [target.'cfg(...)'.dependencies] and similar variants.
  if (/^target\..+\.(?:dev-|build-)?dependencies$/.test(section)) {
    return true;
  }
  return false;
}

/**
 * When a section is a table-form dep declaration such as
 * `[dependencies.serde]` or `[dev-dependencies.tokio]`, return the crate name.
 * Returns null otherwise.
 */
function tableDepName(section: string): string | null {
  const m = section.match(
    /^(?:workspace\.)?(?:dev-|build-)?dependencies\.([a-zA-Z0-9_-]+)$/,
  );
  if (m) return m[1];

  // Target-specific table form: [target.'cfg(...)'.dependencies.crate-name]
  const mt = section.match(
    /^target\..+\.(?:dev-|build-)?dependencies\.([a-zA-Z0-9_-]+)$/,
  );
  if (mt) return mt[1];

  return null;
}

/**
 * Parse a Cargo.toml document text and return all registered dependencies
 * with their source line numbers.
 *
 * Handles:
 *  - [dependencies], [dev-dependencies], [build-dependencies]
 *  - [workspace.dependencies]
 *  - [target.'cfg(...)'.dependencies] variants
 *  - [dependencies.crate-name] table-form declarations
 *  - Inline `crate = "version"` and `crate = { version = "..." }` lines
 *  - path = and git = detection (marks isPathDep / isGitDep)
 */
export function parseDependencies(text: string): ParsedDependency[] {
  const lines = text.split("\n");
  const deps: ParsedDependency[] = [];

  let inDepSection = false;
  // When we parse a [dependencies.crate] header, we track it here so that
  // subsequent `path =` or `git =` lines can mark the dep correctly.
  let currentTableDep: ParsedDependency | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Skip blank lines and comments.
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // TOML array-of-tables [[...]] — never a dependency section.
    if (trimmed.startsWith("[[")) {
      inDepSection = false;
      currentTableDep = null;
      continue;
    }

    // Section header [...]
    if (trimmed.startsWith("[")) {
      const headerMatch = trimmed.match(/^\[([^\]]+)\]/);
      if (!headerMatch) {
        inDepSection = false;
        currentTableDep = null;
        continue;
      }

      const section = headerMatch[1].trim();
      currentTableDep = null;

      // Table-form dep: [dependencies.crate-name]
      const depName = tableDepName(section);
      if (depName && CRATE_NAME_RE.test(depName)) {
        const dep: ParsedDependency = {
          name: depName,
          line: i,
          isPathDep: false,
          isGitDep: false,
        };
        deps.push(dep);
        currentTableDep = dep;
        inDepSection = false;
        continue;
      }

      inDepSection = isDepSection(section);
      continue;
    }

    // Inside a [dependencies.crate] table: look for path/git keys.
    if (currentTableDep) {
      if (/^path\s*=/.test(trimmed)) {
        currentTableDep.isPathDep = true;
      }
      if (/^git\s*=/.test(trimmed)) {
        currentTableDep.isGitDep = true;
      }
      continue;
    }

    if (!inDepSection) {
      continue;
    }

    // Inline dependency: `crate-name = ...`
    // Match the key at the start of the (non-indented) line.
    const depMatch = raw.match(/^([a-zA-Z0-9_-]+)\s*=/);
    if (!depMatch) {
      continue;
    }

    const name = depMatch[1];
    if (!CRATE_NAME_RE.test(name)) {
      continue;
    }

    // Check for path or git keys in the value portion of the same line.
    const valuePart = raw.slice(raw.indexOf("=")).toLowerCase();
    const isPathDep = /\bpath\s*=/.test(valuePart);
    const isGitDep = /\bgit\s*=/.test(valuePart);

    deps.push({ name, line: i, isPathDep, isGitDep });
  }

  return deps;
}
