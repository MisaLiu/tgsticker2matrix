# Repository Instructions

## Commands

- Use `pnpm`; `pnpm-lock.yaml` is authoritative. The repository is a single root package; `worker/` is not a separate package.
- `pnpm dev` runs the Preact client and Cloudflare Worker together through the Vite plugin.
- `pnpm test` runs all Vitest tests. Run one file with `pnpm test -- src/lib/matrix-pack.test.ts` or `pnpm test -- worker/src/index.test.ts`.
- `pnpm typecheck` runs `tsc --noEmit`; `pnpm lint` runs `oxlint src worker`.
- `pnpm build` typechecks first, then builds both the client and Worker. `pnpm deploy` builds before `wrangler deploy`.
- `pnpm preview` is the package's `vite preview` script; it is not the deploy command.

## Structure

- The browser entrypoint is `src/main.tsx`; the four-step workflow is coordinated by `src/App.tsx` and `src/steps/`.
- The Worker entrypoint is `worker/src/index.ts`. It handles `/health`, `/sticker-set`, and `/file`; other paths delegate to `env.ASSETS` for static assets and SPA fallback.
- `wrangler.jsonc` must include any new Worker-first route in `assets.run_worker_first`, or the route will be handled as a static asset.

## Architecture

- `src/lib/pipeline.ts` orchestrates conversion and output selection. Keep Matrix write policy out of it.
- `src/lib/matrix-pack.ts` owns Matrix pack intake: uploads and deduplication, personal/room writes, stable/unstable dual writes, room reuse, and subscription cleanup.
- `MatrixPackClient` in `matrix-pack.ts` is the seam. The production `MatrixClient` and test fakes should satisfy it instead of exposing fetch details to pack policy.
- `src/lib/matrix.ts` is the fetch-based Matrix protocol client; changes to request paths, authentication, or Matrix error translation belong there.

## Testing

- Vitest uses `environment: 'node'` and disables the Cloudflare Vite plugin through `process.env.VITEST`; do not assume DOM or Worker runtime globals in tests.
- Browser-only TGS/WEBM rendering is not covered by the Node test environment; keep pure GIF behavior in Vitest and verify browser changes through the dev app/build.
- Worker tests should stub upstream `fetch` and assert that invalid token, set-name, file-id, or upstream file-path input never creates an unsafe request.

## Files And Docs

- `dist/` and `.wrangler/` are generated artifacts; edit source/configuration instead.
- Keep `README.md` limited to introduction, usage, development, and `LICENSE`; detailed protocol and operational notes do not belong there.
