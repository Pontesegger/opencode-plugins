# Publishing checklist

## Repository and release review

- Public source repository: https://github.com/Pontesegger/opencode-plugins.
- Review all tracked files for secrets, personal paths, and third-party material.
- MIT licensing is configured in the root and both package manifests. Keep the
  root and package `LICENSE` files consistent and included in each npm package;
  the copyright notice credits "Christian Pontesegger".
- Keep `repository`, `homepage`, and `bugs` metadata in both manifests current;
  each workspace declares its `repository.directory`.
- Review compatibility and document any runtime limitations. SDK 2.2.7 is pinned;
  do not replace it with `latest` without testing newer API contracts.
- Review [SECURITY.md](SECURITY.md) and rerun `npm audit`. Do not describe the
  packages as security-reviewed or vulnerability-free based on passing tests.

## GitHub

The repository is published on GitHub. For subsequent updates, review the files,
run the checks, then commit and push:

```sh
npm run check
git add .
git diff --cached
git commit -m "Describe the changes"
git push origin main
```

The CI workflow only checks code; it never publishes npm packages. Users can
clone this GitHub repository and load local directories without npm publication.

## Optional npm publication

1. Choose available names/scopes. The current unscoped names are provisional.
   `npm view <name>` can show an existing package; a missing package does not
   guarantee you have permission to publish that name.
2. Update package names, root scripts referencing those names, and documentation
   together if using a scope or different names.
3. Keep the root workspace private. Remove `private: true` from **only the
   packages approved for release**, choose initial versions, and complete license
   and repository metadata. Refresh the lockfile with `npm install --ignore-scripts`.
4. Run `npm run check` and `npm run test:hover`. Review each actual tarball:

   ```sh
   npm pack --workspace=opencode-context-inspector
   npm pack --workspace=opencode-sidebar-info
   tar -tzf opencode-context-inspector-1.0.0.tgz
   tar -tzf opencode-sidebar-info-1.0.0.tgz
   ```

5. Install those `.tgz` files into a separate temporary npm project and load the
   installed directories in a clean OpenCode test configuration. Test the
   **installed package**, not just the workspace-linked copy. Do not enable both
   the original and packaged versions simultaneously. Check the context hook,
   RPC, usage row, inspector, sidebar, and reload cleanup.
6. Log in to npm locally using your own account. Do not put tokens in this repo.
   Publish each approved tarball individually:

   ```sh
   npm publish ./opencode-context-inspector-1.0.0.tgz --access public
   npm publish ./opencode-sidebar-info-1.0.0.tgz --access public
   ```

7. Tag the release, publish GitHub release notes, and replace local-path
   installation examples with the actual npm names and versions. Context
   Inspector still belongs in `opencode.json(c)` and Sidebar Info in `cli.json`.

Never add publication credentials to GitHub Actions until a separate publishing
workflow and its permissions have been reviewed. Prefer npm trusted publishing
if automating releases later.
