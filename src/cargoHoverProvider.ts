import * as vscode from "vscode";
import { parseDependencies } from "./cargoTomlParser";
import { fetchCrateInfo } from "./cratesIoApi";

export class CargoHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    const deps = parseDependencies(document.getText());
    const dep = deps.find((d) => d.line === position.line);

    if (!dep) {
      return undefined;
    }

    // For path deps, offer a minimal hover (no crates.io lookup).
    if (dep.isPathDep) {
      const md = new vscode.MarkdownString(undefined, true);
      md.supportThemeIcons = true;
      md.appendMarkdown(`$(folder) **${dep.name}** — local path dependency`);
      return new vscode.Hover(md);
    }

    if (dep.isGitDep) {
      const md = new vscode.MarkdownString(undefined, true);
      md.supportThemeIcons = true;
      md.appendMarkdown(`$(git-commit) **${dep.name}** — git dependency`);
      return new vscode.Hover(md);
    }

    let info;
    try {
      info = await fetchCrateInfo(dep.name);
    } catch {
      // Silently return no hover when the API is unreachable.
      return undefined;
    }

    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = true;
    md.supportThemeIcons = true;

    // ── Header ──────────────────────────────────────────────────────────────
    md.appendMarkdown(`### $(package) ${info.name}`);
    if (info.latestVersion) {
      md.appendMarkdown(` \`${info.latestVersion}\``);
    }
    md.appendMarkdown("\n\n");

    // ── Description ─────────────────────────────────────────────────────────
    if (info.description) {
      // Escape any markdown that might appear in the description.
      const safeDesc = info.description
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      md.appendMarkdown(`${safeDesc}\n\n`);
    }

    md.appendMarkdown("---\n\n");

    // ── Links ────────────────────────────────────────────────────────────────
    const links: string[] = [
      `[$(package) crates.io](${info.cratesIoUrl})`,
      `[$(book) docs.rs](${info.docsRsUrl})`,
    ];

    if (info.repositoryUrl) {
      links.push(`[$(source-control) Repository](${info.repositoryUrl})`);
    }

    if (info.homepageUrl && info.homepageUrl !== info.repositoryUrl) {
      links.push(`[$(globe) Homepage](${info.homepageUrl})`);
    }

    md.appendMarkdown(links.join(" &nbsp;|&nbsp; ") + "\n");

    return new vscode.Hover(md);
  }
}
