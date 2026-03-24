import * as vscode from "vscode";
import { CargoLensProvider } from "./cargoLensProvider";
import { CargoHoverProvider } from "./cargoHoverProvider";
import { clearCache } from "./cratesIoApi";

const CARGO_TOML_SELECTOR: vscode.DocumentSelector = {
  pattern: "**/Cargo.toml",
  scheme: "file",
};

// Validates that a URL is an absolute http/https URL before opening it.
// This prevents any injected or malformed value from being passed to the shell.
const SAFE_URL_RE = /^https?:\/\//i;

export function activate(context: vscode.ExtensionContext): void {
  const lensProvider = new CargoLensProvider();
  const hoverProvider = new CargoHoverProvider();

  context.subscriptions.push(
    // ── Providers ────────────────────────────────────────────────────────────
    vscode.languages.registerCodeLensProvider(
      CARGO_TOML_SELECTOR,
      lensProvider,
    ),
    vscode.languages.registerHoverProvider(CARGO_TOML_SELECTOR, hoverProvider),

    // ── Internal command: open a validated URL in the default browser ─────
    vscode.commands.registerCommand(
      "cargo-toml-lens.openUrl",
      (url: unknown) => {
        if (typeof url === "string" && SAFE_URL_RE.test(url)) {
          vscode.env.openExternal(vscode.Uri.parse(url, true));
        }
      },
    ),

    // ── Internal no-op (used for disabled lens buttons) ───────────────────
    vscode.commands.registerCommand("cargo-toml-lens.noOp", () => {
      /* intentionally empty */
    }),

    // ── User-facing command: clear cached crate metadata ──────────────────
    vscode.commands.registerCommand("cargo-toml-lens.clearCache", () => {
      clearCache();
      lensProvider.refresh();
      vscode.window.showInformationMessage(
        "Cargo.toml Lens: crate info cache cleared.",
      );
    }),

    // Dispose the lens provider's event emitter on deactivation.
    lensProvider,
  );
}

export function deactivate(): void {
  // Nothing to clean up beyond what context.subscriptions handles.
}
