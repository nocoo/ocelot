# 08 · Visual identity

Status: Source adoption is complete for the owner-approved drawing, finishing `03`. This document was created before consumer replacement. The owner authorized source publication, README/profile synchronization and the Hexly patch release on 2026-09-11.

The selected drawing is an offset warm-gold ocelot portrait with connected flat facets, dark species markings, both eyes visible and one coral/saffron/teal folded-paper bird. The short neck and shoulder intentionally continue through the bottom and lower-left canvas. Preserve the accepted pointed far ear and the complete paper bird.

The generation archive is `nocoo/hexly.ai/artwork/logo-family/ocelot/2026-09-11-01`. Native SHA-256: `4c73d8f8bc72c14e02260cbddd8c49d8aa6c526c53d5aad449eb30d764f61d3a`. The original SVG favicon and inline SVG source remain archived there. The selected finishing recipe and exact master checksums are recorded in `assets/brand/provenance.json`.

| Consumer | Asset role |
| --- | --- |
| Root `logo.png` | Canonical transparent 2048 px foreground |
| `assets/brand/icon.png` | Complete square presentation with independent paper and shadows |
| `assets/brand/icon-rounded.png` | Rounded presentation for both README headers |
| Shared `Mark`, including navigation, collapsed rail, article footer and empty reader | Transparent foreground, served at 80/160 px; no enclosing tile or corner crop |
| Browser favicon | Transparent 16/32 px PNGs |
| Apple touch icon | Square 180 px presentation; the platform supplies its own mask |
| Social previews | The shared Hexly image at `https://hexly.ai/og/ocelot.jpg` |

The paper background uses independent broken almond rosettes and turned-page curves. It is a presentation palette, not a website theme. Ocelot keeps its existing blue-gray controls, light/dark reading surfaces and text colors. Application marks use the same foreground in both themes.

The archived `export-source.mjs` in the Hexly study derives the application, favicon and touch assets from the selected masters using Hexly's existing Sharp toolchain. Ocelot builds use the checked-in PNGs and need no image-processing dependency. Re-run that export after an approved identity change; do not crop, recolor or reconstruct the animal. The source request, masks, native-pixel checks, ten export sizes, static comparison and catalogue comparison live in Hexly. Source consumer checks and current adoption status are recorded alongside the brand provenance.

The app remains a single-user, read-only GitHub vault reader. Branding does not deploy the application, configure Cloudflare Access, install credentials or change its GitHub/cache behavior. The published navigation update at `8875681` is included as the base of this change; its interface and behavior are preserved. The obsolete footer opacity rule is removed so every application mark uses the accepted colors.

## Verification

- Biome passed. Four existing browser journeys passed: Basalt breadcrumbs/collapsed navigation, light and dark desktop accessibility/preferences, and mobile drawer/outline/reduced motion. Two stale sidebar-color expectations were updated to the already-published Basalt L0 colors, `#f3f5f7` and `#12161c`; the application theme was not changed.
- The production frontend build passed. README light, dark and mobile screenshots now show the current navigation and new mark with synthetic notes.
- The study's `inspection/source-browser/checks.json` records eight actual consumer states across both themes, five exact served asset checksums, 36/23/57 px application marks, full opacity, transparent backgrounds, no additional crop or filter, and no overflow or page errors.
- Native extraction preserves the RGB of all 1,953,070 fully opaque pixels. Both ears, eyes, muzzle, whiskers and the full paper bird remain inside the rounded boundary; only the approved shoulder entry crosses the frame. All ten export sizes are retained.
- The source pre-commit typecheck and pre-push non-View coverage gate remain enabled. Publication results and immutable source revision are recorded in the Hexly adoption record after the push.
