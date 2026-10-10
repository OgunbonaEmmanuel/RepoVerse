# RepoVerse

A working code explorer: real files form a city, and parsed, resolved imports connect its buildings. Next.js, strict TypeScript, React, Three.js / React Three Fiber, and the TypeScript compiler API. No AI, accounts, database, or deployment.

## Setup

Node 20.9+ is required. Verified on Windows with Node **20.18.0**, npm **10.8.2**. Vite 6 is explicit for compatibility with this Node version. Dependencies are fixed by `package-lock.json`.

```sh
npm ci
npm run dev
```

Open **http://localhost:3000**. The initial, labelled bundled demo needs no token or external network after installation. Load demo calls the local server, not GitHub. Keep the Node server running; this is not a static-only export.

```sh
npm run typecheck
npm run format:check
npm test
npm run benchmark
npm run build
npm run start
```

Build uses webpack. Start serves the production build on port 3000. For browser checks, stop existing servers on that port, build first, then run:

```sh
npm run test:e2e
```

The suite starts/stops a production server and uses installed **Microsoft Edge**. On machines without Edge, install a Playwright browser and adjust `channel` in `playwright.config.ts`; that alternative was not verified here. The live GitHub test requires network and API quota. Other browser tests use clearly labelled fixtures.

Optional: copy `.env.example` to `.env.local`, set **GITHUB_TOKEN**, then restart the server. The variable is server-only: never use a NEXT_PUBLIC_ prefix. A token improves API quota; demo mode needs none. Only preview-eligible files receive blob requests; other buildings use tree metadata alone.

## Exploring

- Import a public repository root URL, e.g. `https://github.com/octocat/Hello-World`. The default branch is pinned to one commit. Branch/subtree URLs receive explicit guidance.
- Select a building or file-tree button. Search matches full paths without regard to case; Enter selects and focuses the first result. Tab and Enter/Space operate file buttons and dependency links. Selected ancestors reopen; navigating outside the filter clears it.
- Imports / Imported by show outgoing / incoming resolved connections. Arrows always point from importer to imported file. Only selected-file edges are drawn. Self-imports remain in details; zero-length arrows are omitted.
- Dependency messages distinguish file states. Unsupported types say **Dependency analysis is not supported for this file type.** Supported files with unavailable contents explain the size limit, download budget, interruption, binary text decoding, LFS pointer or unloaded contents that prevented analysis. Syntax errors explicitly mark analysis incomplete. Only a successfully analysed file with no detected imports says **No imports found.** Detected external and unresolved imports retain their explanations, even when no internal connection resolves. **Imported by** works for unsupported and metadata-only targets; an empty incoming view says **No incoming imports found among analysed files.**
- The repository has one outer boundary. Folder platforms sit entirely inside their parents: the demo's `src` contains `data`, `ui`, `utils` and direct files such as `main.ts`; `scripts` sits beside it, and root files remain outside both. Each inventoried file appears once. Increasing platform elevation and visible borders distinguish nesting.
- Click a district, its folder-navigation button, or the tree's adjacent focus button to focus it. Click breadcrumbs, **Parent folder**, or **Full repository** to navigate back. Folder controls explicitly expand/collapse districts and show descendant file counts. Collapse hides descendants without repacking, preserving spatial orientation. The file tree's own disclosure controls operate independently.
- Selecting a file through the tree, search, or dependency links expands its required ancestors and focuses the building. A selected file hidden by a later collapse has a **Reveal selected file** action. Hidden dependency endpoints are identified by their actual file path and collapsed folder in details; click the connection to reveal the file. Arrows are omitted while either endpoint is hidden, never redirected to a folder.
- Drag to orbit, scroll to zoom, or use zoom, focus and reset buttons. The initial camera and reset fit the complete city; folder focus fits that district.
- Details show filename, repository-relative path, category, available Git blob size, content availability, dependency-analysis status, and a commit-pinned GitHub link. Loaded text has an escaped read-only source preview. Metadata-only files have **unknown** line counts and no source preview; selecting them never fetches content.
- Loaded-text height remains `min(10, 0.6 + 0.65 * log2(1 + lines))`. Metadata-only buildings use a fixed **0.85** height and a white diamond on the roof; the sidebar uses the same diamond. Eight shared categories identify source code, data, serialized files, images/media, documentation, archives, configuration and unknown files. Classification is filename-based, not a claim about content or analysis support. White outlines mark selection, gold outlines mark hover, and teal arrows connect dependencies. Unrelated buildings gently dim when resolved dependencies are shown.
- Hover a building for its filename and full repository-relative path. Selection through the city, tree or search keeps its label visible; **Clear selection** removes it. Labels face the camera, keep a fixed readable pixel size, and clamp within the viewport above the camera controls. Labels and guide lines ignore pointer events. Persistent folder labels use the short folder name; hover exposes the full path, also represented by clickable breadcrumb segments. Selected/hovered files take priority, followed by hovered/selected folders, the focused district and background folders. Lower-priority labels move or hide instead of overlapping a higher-priority label. Placement favours positions that obscure less building area.
- Label measurements are cached by content and display state, valid placement slots are retained, and hidden background labels wait until camera movement settles for 120 ms before reappearing. Extra clearance on re-entry reduces boundary flicker. This changes only screen-space labels: building sizes, hierarchy layout, zoom controls and camera behaviour remain unchanged. Crowded views can suppress lower-priority labels (including a second hovered-file label in a very small viewport); counts and paths remain available through folder controls and details. Very long labels are clipped to the available height. Labels may still move or disappear when the view changes enough to create a collision or move a folder offscreen.
- List view works without WebGL; renderer failure retains the tree, details and dependency links. Reduced motion disables the loading pulse; camera changes are immediate.
- Successful imports replace graph and selection together. Failure or cancellation retains the snapshot. Expand Analysis coverage & exclusions for omitted paths and warnings.

Static imports are code relationships, not runtime traces, call order, predictions of impact, or proof of breakage.

## Analysis scope

JS, JSX, TS, TSX, MJS, CJS, MTS and CTS use the TypeScript AST. Extracted forms: static imports, re-exports with module specifiers, import-equals require statements, literal require calls, literal dynamic imports. Locations are one-based source lines. Imported code is neither executed nor type-checked. Syntax errors are visible and extracted imports may be incomplete.

Relative resolution is a bounded approximation, not full Node/TypeScript resolution. It checks, in order:

1. Exact normalized relative path.
2. For .js/.jsx/.mjs/.cjs specifiers, replacement extensions.
3. Appended extensions: .ts, .tsx, .js, .jsx, .mts, .cts, .mjs, .cjs.
4. Directory index files using the same extension order.

Only existing inventoried files produce internal edges. Explicit imports can resolve to metadata-only targets such as CSV or images without downloading those targets. Only loaded JS/TS files generate outgoing edges; missing contents never mean that a file has no dependencies. Missing, excluded and out-of-root targets remain unresolved. Computed calls and obvious aliases (@/, ~, #) remain unresolved. Bare specifiers, scoped packages and node: built-ins are tracked as **external / bare specifiers**; they may also be unconfigured aliases. We cannot distinguish all these cases without configuration.

No tsconfig paths/baseUrl, package exports, bundler plugins, URL/glob imports, type-level import expressions, or runtime module resolution. Calls spelled require are treated syntactically; lexical scope/shadowing is not analysed. Other languages/formats show **Dependencies unsupported**, independently of preview availability. Unloaded JS/TS files show **Dependencies not analysed — contents unavailable**. A complete inventory does not imply complete content fetching or dependency analysis.

## Inventory and previews

Import first inventories regular files from the pinned GitHub tree, preserving parent paths, available sizes and commit-pinned links. Binary files, unknown extensions, CSV, pickle and oversized files remain searchable buildings. A second pass downloads only bounded preview-eligible text; a third parses loaded JS/TS and resolves imports against the entire inventory. Content failures and budgets retain the inventory. The UI reports inventory completeness separately from content/analysis coverage.

Content statuses distinguish **Contents not loaded**, **Binary preview unavailable**, **Exceeds preview limit**, download-budget/interruption states and loaded previews. The filename-based preview allowlist includes JS/TS, JSON, Markdown, CSS/SCSS/Sass, HTML, YAML/TOML, Python, Go, Rust, Java, C/C++, shell, SQL, Vue/Svelte, XML, INI/conf and txt, plus Dockerfile, LICENSE, Makefile, README, .gitignore, .gitattributes and .editorconfig. CSV/data, serialized objects, images/media, archives, notebooks and unknown formats are inventory-only. Entries with no reported size remain visible and are not fetched. NUL/non-UTF-8 content encountered in an allowed text file changes its preview status instead of deleting its building.

Git tree sizes describe **Git blobs**, not necessarily LFS assets. If an eligible text download is a valid Git LFS v1 pointer, RepoVerse reports the pointer bytes and separately the declared asset bytes, leaves lines unknown and skips analysis. It never downloads LFS assets. Tree metadata cannot identify a pointer or determine the asset size by itself; uninspected CSV/PKL/binary entries are not opened to check for LFS, and the details explain that their asset size may be unknown. No pickle deserialization, archive extraction, media decoding or imported-code execution occurs.

## Imported-source boundary and limits

Repository contents, comments, configs and documentation are untrusted text. Nothing imported is executed, installed, evaluated, or used as agent instructions. React escapes source, including HTML/SVG. Credentials are excluded from graph responses and browser bundles.

Only validated https://github.com/owner/repository inputs are accepted. All server requests target api.github.com; redirects are rejected. Blob destinations use validated SHAs, ignoring URLs in tree entries. Private repositories are rejected even with a token. Symlinks/submodules are excluded. No archives or filesystem extraction are used.

| Limit                        | Default                |
| ---------------------------- | ---------------------- |
| Inventoried regular files    | 2,000                  |
| Each downloaded preview      | 512 KiB                |
| Total downloaded content     | 20 MiB                 |
| Metadata JSON response       | 4 MiB                  |
| Tree entries                 | 100,000                |
| API request including body   | 10 seconds             |
| Whole GitHub fetch operation | 90 seconds             |
| Import request JSON          | 1 KiB / 10 seconds     |
| Simultaneous imports         | One per server process |

Defaults are configurable in `lib/model.ts`; analyser/importer accept explicit limit objects. The file-count cap applies to inventory; per-file and total byte budgets apply only to content downloads. Blob JSON transport is separately bounded to roughly 1.5 times the remaining content limit plus 4 KiB for base64 overhead. Both metadata and decoded bytes are checked; downloaded binary bytes consume the budget even when discarded. Sources are fetched sequentially. Errors, quota and timeouts stop further preview reads, preserve all inventoried entries, and return Partial import with a warning. Errors before inventory is available return an actionable error. A truncated GitHub tree visibly marks **Inventory incomplete**; unknown missing paths cannot be counted. Known file-count omissions are individually listed. Oversized metadata is an error rather than silently truncated.

Inventory exclusions remain explicit: path segments node_modules, .git, dist, build, coverage, .next, vendor and `__pycache__`; lockfiles; unsafe paths; symlinks/submodules and invalid blob metadata. `lib/policy.ts` contains the path rules. These exclusions are counted and listed by path/reason in coverage. Binary formats, unsupported extensions and oversized content are **not inventory exclusions**. Generated files outside the named directories can still appear.

## Verification and measurements

### Express download recovery

The previous importer stopped preview fetching on the first failure, then marked
that file **and every later eligible file** as “download interrupted”. It retained
the cause only in a repository warning, so that message did not prove that
`lib/express.js` had even been requested. Its 1,636-byte size is below the 512 KiB
preview limit. During investigation, a real GitHub response returned HTTP 403,
`X-RateLimit-Remaining: 0`, and an explicit API-rate-limit error. The original
user snapshot's commit/warning was unavailable, so its historical failure cannot
be conclusively attributed to that later response.

Each failed file now retains its cause: rate limiting (distinct from access-denied
403), timeout, cancellation, network failure, HTTP error, or invalid response.
Details include available HTTP status, request ID, attempt count and retry time.
Files skipped after another failure name that file and say they were not requested.
The coverage warning records the initial failure even after an individual recovery.

**Retry loading file** is available for failed, preview-eligible JS/TS files.
It reads only the original snapshot's blob SHA, analyses the recovered text
against the existing inventory, and replaces that file's direct outgoing edges.
Other files' incoming connections, selection, search and folder navigation remain
intact. Binary, oversized, unknown-size and non-source metadata-only files are
not eligible. Decoded content still consumes the original snapshot's byte budget;
retrying does not grant a new budget. LFS assets are never fetched.

Recovery is bounded to three actions per file, at most two HTTP attempts per
action, a 10-second request deadline and a 25-second action deadline. Only
transient errors receive an automatic second attempt. Requests honour
`Retry-After` (seconds or date) and primary-quota reset headers; a secondary rate
limit without a deadline waits at least 60 seconds. Short waits up to two seconds
can occur within an action; longer waits return a visible countdown and disable
the button. Server-side cooldown checks also prevent early requests.
See [GitHub's retry guidance](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#handle-rate-limit-errors-appropriately).

Recovery metadata and successful results are held in server memory for one hour,
with at most eight snapshots and one running recovery per snapshot. A repeated
completed request returns its cached result without another GitHub request.
Restart, expiry or eviction requires a new repository import. Cooldown and session
state are process-local, not shared between server instances. Cancelled browser
requests may race with server completion; retrying returns a cached result if
completion already occurred. Existing snapshots imported before this change must
be reimported once to acquire recovery metadata.

Live scoped verification on 10 October 2026 used Express commit
`a419aa7350389a275ab45fde2e849ed1f02449ef`. After quota recovered, the test read
real GitHub tree/blob metadata for a six-file subset, injected one HTTP 503,
then successfully recovered the real **1,636-byte** express.js with **one blob
request** and no repository/tree reimport. Seven actual API requests were made
in total. This was a scoped recovery check, not a complete Express import or a
reproduction of the original unknown failure.

| Direct importer                      | Literal require   | Resolved target    |
| ------------------------------------ | ----------------- | ------------------ |
| lib/express.js:18                    | ./application     | lib/application.js |
| lib/express.js:20                    | ./request         | lib/request.js     |
| lib/express.js:21                    | ./response        | lib/response.js    |
| examples/route-map/index.js:8        | ../../lib/express | lib/express.js     |
| examples/route-middleware/index.js:7 | ../../lib/express | lib/express.js     |

Both examples directly import express.js. Their connections through express.js
to application/request/response are indirect and are not added as direct edges.
The corresponding upstream source is preserved as read-only, MIT-licensed text
in `tests/fixtures/express/`. Offline tests deliberately simulate failure and
include synthetic binary/oversized entries; they are clearly labelled fixtures.

To repeat the optional live scoped check in PowerShell (network and API quota required):

```powershell
$env:REPOVERSE_LIVE_EXPRESS = "1"
npm test -- tests/express-live.test.ts --reporter=verbose
Remove-Item Env:REPOVERSE_LIVE_EXPRESS
```

The live check is skipped by default. Run `npm test` for deterministic offline
checks, and after building run
`npm run test:e2e -- --grep-invert "public GitHub"` for browser regression checks.

Verified for this change on 10 October 2026: **54 offline tests passed** (the
opt-in live test is skipped in the default suite), the scoped live test passed
separately, and **10 Edge browser tests passed**. Strict TypeScript, production
build and formatting checks passed. New tests cover cause preservation,
not-requested files, timeout/cancellation/network/access errors, both Retry-After
formats, quota reset, bounded attempts, unchanged commit/blob identity, shared
content budgets, stale results, direct-only incoming/outgoing edges, route
validation, and zero retry requests for binary/oversized metadata.
The browser checks exercise retry success and rate-limit failure, cooldown
re-enabling, search/selection retention, source preview and rendered dependency
endpoints, plus the existing label/hierarchy/fallback regressions.

The 1,000-file browser fixture measured **1,106 ms** to DOM/canvas readiness
(including 500 ms settling), and **83 ms** to search selection and its label.
These are single-run observations, not frame-rate guarantees. Full live Express
import, browser cancellation races, multi-process recovery and other browsers
were not verified in this revision. Timeout/cancellation classification was
checked with deterministic tests.

Earlier label refinement, verified on 9 October 2026:

- 43 passing parser/resolver, inventory, exclusions/resource limits, fetch-boundary, scale, explorer interaction, label-placement, dependency-message and hierarchy tests. Dependency checks cover every unavailable-content state, unsupported types, successful empty analysis, external/unresolved imports, syntax errors, and incoming connections to unsupported/unanalysed targets. Label checks cover priority, collision suppression, viewport containment and stable placement slots during small camera shifts. Inventory tests record every requested URL: CSV/PKL/binary/oversized/unknown entries receive no blob-content requests, content failures preserve buildings, inventory caps report omissions, and LFS pointers remain distinct from assets. Hierarchy checks cover parent-child containment, sibling/building non-overlap, unique file placement, root files, implicit parents, 80 nesting levels, collapse/reveal, elevated dependency endpoints and camera fitting at three aspect ratios.
- Clean `npm ci` installation and development-server HTTP 200 with the demo page. `npm run format` and `npm run format:check` maintain reviewable formatting.
- Strict TypeScript and optimized production build.
- Eight local headless Edge browser tests pass: real building and district clicks; hover and persistent labels; pointer transparency and no duplicate selected/hover label; tree/search synchronisation; zoom/orbit, non-overlap and viewport containment; short persistent folder names and full hover paths; breadcrumbs and parent/full-repository navigation; collapse counts; search and dependency reveal; incoming/outgoing visible endpoints; list view; demo reload; 1,000-file selection; WebGL failure fallback. Frame sampling verifies stable label membership, positions and dimensions over 24 frames at rest, after camera motion and during stationary hover. The selected label remains visible throughout sampled zoom/rotation steps. The inventory fixture additionally checks all eight sidebar/legend category colours, metadata-only selection/search, GitHub links, sizes/statuses, LFS sizes, roof-marker counts, and parsed dependencies to unloaded targets. Screenshots were inspected for nesting, short labels, category colours, roof diamonds and readable metadata details. File hashes confirm the hierarchy layout, building renderer and camera module are unchanged in this refinement.
- Run `npm run test:e2e -- --grep-invert "public GitHub"` for offline browser checks. `tests/fixtures/inventory.ts` provides a labelled synthetic movie-repository fixture via the real importer and parser; it is not a cached copy of the linked repository. The original octocat/Hello-World browser check remains available but was not rerun in this revision.
- The preceding inventory revision verified [OgunbonaEmmanuel/movie-recommendation](https://github.com/OgunbonaEmmanuel/movie-recommendation) at commit `9920f12e672cbbb55146b450c8f32820c1b46631`: **17 inventoried files**, complete tree, **13 metadata-only files**. Both `tmdb_5000_credits.csv` and `tmdb_5000_movies.csv`, plus `get_recommendations.pkl`, `movies.pkl` and `similarity.pkl`, appear at the repository root. The request-recording importer made **four blob requests**, exclusively for `.gitattributes`, `app.py`, `README.md` and `requirements.txt`; **zero CSV/PKL content requests**. The normal server import endpoint and Edge browser search/selection also passed without response interception. Live GitHub checks were not repeated for the label/message-only refinement. No JS/TS files exist in this snapshot, so zero dependency edges is expected; dependency behaviour is verified separately with parsed fixture sources. Reproduce with `npm run test:e2e -- e2e/inventory.spec.ts --grep "public GitHub movie"` after building, with network/quota available.
- Installation audit reported zero findings after updating the test runner to its patched release.

`lib/scale.ts` generates **1,000 TS files, 20 folder districts plus the repository boundary, and 1,000 exact edges in a cycle**, labelled generated-scale-v1. Each file has one import, two exports and 0-79 comment lines. The inventory revision's benchmark measured **460.21 ms** for inventory/graph extraction, **11.77 ms** for recursive layout and **1,519,877 bytes** serialized graph size; those modules are unchanged here. The final refined-label browser run measured **1,631 ms** from fixture load to DOM/canvas readiness (including an intentional 500 ms settling period), and **179 ms** for search selection and its label to appear. These are single-run observations, not FPS claims or guarantees.

Buildings share one instanced geometry/material; metadata-only roof diamonds use one additional instanced mesh. Rendering is on demand, and only selected connections appear. At most **two building labels and eight district labels** mount in the screen-space overlay; there is no persistent HTML label per file. Label projection follows camera changes, and collision placement reserves room for the camera controls. The scale browser test verifies these bounds and intercepts import with a labelled generated fixture; production import uses actual tree metadata and bounded source reads through the same parser pipeline.

Layout uses deterministic recursive shelf packing with padding, sibling gaps, a reserved folder-label strip and a separate block for each folder's direct files. Parent dimensions accommodate all contents. It derives the hierarchy from inventoried paths, including metadata-only files: empty folders and folders containing only excluded files are absent. Collapse preserves the expanded footprint; it does not compact the city. Deep chains can produce large platforms, so folder focus is more useful than the overview for those repositories.

Unverified: Firefox/Safari, mobile touch, screen-reader review, sustained GPU/frame-rate profiling and a live repository at every maximum limit. The 80-level fixture verifies layout calculations, not browser usability at that depth. API errors/limits use deterministic test inputs. The tree is not virtualized. Source loads eagerly within bounds; progress is phase text rather than per-file streaming. The concurrency guard is process-local, suitable for a local MVP rather than hosted multi-instance quota control.

Manual follow-up: test reduced motion; navigate import/search/folders/files/details using only the keyboard; verify orbit/zoom/reset on your GPU; import a larger public JS/TS repository with quota available and inspect exclusions/coverage.

## Code map and stages

- lib/model.ts: serializable graph and limits, without rendering objects.
- lib/analyze.ts: AST extraction from loaded text and resolution against full inventory.
- lib/dependency-message.ts: outgoing analysis explanations and qualified incoming empty states.
- lib/inventory.ts: metadata-only nodes, preview eligibility and LFS-pointer recognition.
- lib/file-types.ts: shared classification, category colours and preview allowlist.
- lib/github.ts and lib/policy.ts: bounded fetching and exclusions.
- lib/github-client.ts and lib/github-transport.ts: bounded HTTP reads, failure causes and GitHub cooldown handling.
- lib/load-preview.ts and lib/file-recovery.ts: shared preview decoding and bounded commit-pinned recovery sessions.
- lib/apply-recovery.ts and components/FileRetry.tsx: direct-edge replacement and retry/cooldown controls.
- lib/demo.ts and lib/scale.ts: explicitly labelled fixtures using real analysis.
- lib/layout.ts: pure recursive hierarchy packing, collapse visibility and file dependency endpoints.
- lib/city-camera.ts: full-city, district and file camera framing.
- components/FolderNavigation.tsx: folder breadcrumbs, focus and expand/collapse controls.
- lib/city-labels.ts and components/CityLabels.tsx: bounded, camera-facing labels and collision placement.
- components/: renderer, tree and shared explorer state.
- app/api/: local demo and public GitHub endpoints.
- tests/ and e2e/: parser, boundaries, interactions and scale checks.

Stages followed PROJECT_BRIEF.md in order: model/fixture tests, fixture explorer, public import, verification/documentation. AI, private repositories, accounts, collaboration, history, impact predictions and deployment remain deferred. No Git repository was present in the supplied folder; no commits or publishing were performed.

References: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Fiber compatibility](https://r3f.docs.pmnd.rs/getting-started/installation), [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), [GitHub trees](https://docs.github.com/en/rest/git/trees), [Three.js](https://threejs.org/docs/), [Playwright browsers](https://playwright.dev/docs/browsers).
