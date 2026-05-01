# Changelog

All notable changes to **Cargo Quick Links** are documented here.

## [0.1.0] — 2026-05-01

### Added

- **CodeLens links** above every crates.io dependency in `Cargo.toml`:
  - `crates.io` — opens the crate page
  - `docs.rs` — opens the API documentation
  - `Repository` — lazily resolved from crates.io metadata
- **Hover cards** on dependency lines showing crate name, latest version, description, and quick links
- Support for all Cargo dependency sections: `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, `[workspace.dependencies]`, and target-specific variants
- Automatic filtering of git-sourced dependencies from CodeLens
- `cargoTomlLens.enableCodeLens` setting to toggle CodeLens on/off
- `cargoTomlLens.showPathDeps` setting to show CodeLens for local path dependencies
- **Cargo: Clear Crate Info Cache** command to force metadata refresh
- In-memory crate metadata cache with 1-hour TTL and request deduplication
