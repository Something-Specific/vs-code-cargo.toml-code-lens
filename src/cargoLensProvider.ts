import * as vscode from "vscode";
import { parseDependencies } from "./cargoTomlParser";
import { fetchCrateInfo } from "./cratesIoApi";

/**
 * A CodeLens sub-type used exclusively for the lazily-resolved repository link.
 * Storing the crate name here lets resolveCodeLens identify and fulfil it.
 */
class RepoCodeLens extends vscode.CodeLens {
  constructor(
    range: vscode.Range,
    public readonly crateName: string,
  ) {
    super(range); // no command yet; resolved asynchronously
  }
}

function shouldShowPathDeps(): boolean {
  return vscode.workspace
    .getConfiguration("cargoTomlLens")
    .get<boolean>("showPathDeps", false);
}

export class CargoLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses: vscode.Event<void> =
    this._onDidChangeCodeLenses.event;

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (
      !vscode.workspace
        .getConfiguration("cargoTomlLens")
        .get<boolean>("enableCodeLens", true)
    ) {
      return [];
    }

    const deps = parseDependencies(document.getText());
    const lenses: vscode.CodeLens[] = [];

    for (const dep of deps) {
      // Skip git deps. Skip path deps unless the user enabled them.
      if (dep.isGitDep) {
        continue;
      }
      if (dep.isPathDep && !shouldShowPathDeps()) {
        continue;
      }

      const range = new vscode.Range(dep.line, 0, dep.line, 0);

      // ── crates.io ──────────────────────────────────────────────────────────
      lenses.push(
        new vscode.CodeLens(range, {
          title: "$(package) crates.io",
          command: "cargo-toml-lens.openUrl",
          arguments: [
            `https://crates.io/crates/${encodeURIComponent(dep.name)}`,
          ],
          tooltip: `Open ${dep.name} on crates.io`,
        }),
      );

      // ── docs.rs ────────────────────────────────────────────────────────────
      lenses.push(
        new vscode.CodeLens(range, {
          title: "$(book) docs.rs",
          command: "cargo-toml-lens.openUrl",
          arguments: [`https://docs.rs/${encodeURIComponent(dep.name)}`],
          tooltip: `Open ${dep.name} documentation on docs.rs`,
        }),
      );

      // ── repository (resolved lazily via resolveCodeLens) ───────────────────
      if (!dep.isPathDep) {
        lenses.push(new RepoCodeLens(range, dep.name));
      }
    }

    return lenses;
  }

  async resolveCodeLens(lens: vscode.CodeLens): Promise<vscode.CodeLens> {
    if (!(lens instanceof RepoCodeLens)) {
      return lens;
    }

    try {
      const info = await fetchCrateInfo(lens.crateName);

      if (info.repositoryUrl) {
        lens.command = {
          title: "$(source-control) Repository",
          command: "cargo-toml-lens.openUrl",
          arguments: [info.repositoryUrl],
          tooltip: `Open ${lens.crateName} source repository`,
        };
      } else {
        lens.command = {
          title: "$(circle-slash) No repository",
          command: "cargo-toml-lens.noOp",
          tooltip: `No repository listed for ${lens.crateName}`,
        };
      }
    } catch {
      lens.command = {
        title: "$(warning) Repository unavailable",
        command: "cargo-toml-lens.noOp",
        tooltip: `Could not fetch metadata for ${lens.crateName}`,
      };
    }

    return lens;
  }

  /** Fire a refresh so all CodeLenses are re-resolved (e.g. after cache clear). */
  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}
