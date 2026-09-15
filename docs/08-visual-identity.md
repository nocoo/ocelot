# 08 · Visual identity

Status: Source adoption is complete for the owner-approved drawing, finishing `03`. This document was created before consumer replacement. The owner authorized source publication, README/profile synchronization and the Hexly patch release on 2026-09-11.

The selected drawing is an offset warm-gold ocelot portrait with connected flat facets, dark species markings, both eyes visible and one coral/saffron/teal folded-paper bird. The short neck and shoulder intentionally continue through the bottom and lower-left canvas. Preserve the accepted pointed far ear and the complete paper bird.

The generation archive is `nocoo/hexly.ai/artwork/logo-family/ocelot/2026-09-11-01`. Native SHA-256: `4c73d8f8bc72c14e02260cbddd8c49d8aa6c526c53d5aad449eb30d764f61d3a`. The original SVG favicon and inline SVG source remain archived there. The selected finishing recipe and exact master checksums are recorded in `assets/brand/provenance.json`.

| Consumer | Asset role |
| --- | --- |
| Root `logo.png` | Canonical transparent 2048 px foreground |
| `assets/brand/icon.png` | Complete square presentation with independent paper and shadows |
| `assets/brand/icon-rounded.png` | Rounded presentation for both README headers |
| Shared `Mark`, including navigation, collapsed rail and article footer | Transparent foreground, served at 80/160 px; no enclosing tile or corner crop |
| Empty reader hero | Complete approved paper presentation, served at 256/512 px; 192 px on desktop and 144 px on mobile, with the original 23% corner radius |
| Browser favicon | Transparent 16/32 px PNGs |
| Apple touch icon | Square 180 px presentation; the platform supplies its own mask |

The paper background uses independent broken almond rosettes and turned-page curves. It is a presentation palette, not a website theme. Ocelot keeps its existing blue-gray controls, light/dark reading surfaces and text colors. Application marks use the same foreground in both themes.

The archived `export-source.mjs` in the Hexly study derives the application, favicon and touch assets from the selected masters using Hexly's existing Sharp toolchain. Ocelot builds use the checked-in PNGs and need no image-processing dependency. Re-run that export after an approved identity change; do not crop, recolor or reconstruct the animal. The source request, masks, native-pixel checks, ten export sizes, static comparison and catalogue comparison live in Hexly. Source consumer checks and current adoption status are recorded alongside the brand provenance.

The app remains a single-user, read-only GitHub vault reader. Branding does not deploy the application, configure Cloudflare Access, install credentials or change its GitHub/cache behavior. The published navigation update at `8875681` is included as the base of this change; its interface and behavior are preserved. The obsolete footer opacity rule is removed so every application mark uses the accepted colors.

## Verification

- Biome passed. Four existing browser journeys passed: Basalt breadcrumbs/collapsed navigation, light and dark desktop accessibility/preferences, and mobile drawer/outline/reduced motion. Two stale sidebar-color expectations were updated to the already-published Basalt L0 colors, `#f3f5f7` and `#12161c`; the application theme was not changed.
- The production frontend build passed. README light, dark and mobile screenshots now show the current navigation and new mark with synthetic notes.
- The study's `inspection/source-browser/checks.json` records eight actual consumer states across both themes, five exact served asset checksums, 36/23/57 px application marks, full opacity, transparent backgrounds, no additional crop or filter, and no overflow or page errors.
- Native extraction preserves the RGB of all 1,953,070 fully opaque pixels. Both ears, eyes, muzzle, whiskers and the full paper bird remain inside the rounded boundary; only the approved shoulder entry crosses the frame. All ten export sizes are retained.
- The source pre-commit typecheck and pre-push non-View coverage gate remain enabled. Publication results and immutable source revision are recorded in the Hexly adoption record after the push.
- The subsequent pre-release sidebar alignment in document 07 uses the same approved foreground at 24 px in expanded, collapsed and mobile navigation. Its single-row title/version layout and six browser states were verified separately. At that stage, the article footer and 57 px empty-reader foreground retained their original sizes; the empty-reader update below supersedes that use.

## Empty-reader presentation

Status: **Implemented and locally verified**, 2026-09-11. The plan was recorded
before implementation. Delivery follows the matching `main` CI/CD run. The owner
asked for a larger empty-page logo using the complete background and texture from
the existing Hexly Ocelot design.

Use the exact `icon-256.webp` and `icon-512.webp` files in the approved Hexly public
archive `logos/family/ocelot/2026-09-11-01/03/`, with explicit Ocelot presentation
filenames and provenance. These are the square presentation, including sand paper,
broken almond rosettes, turned-page curves, grain and the existing contact shadows.
Render the entire square using the recipe's single 23% rounded boundary. Display
at 192 px on desktop and 144 px on mobile, with responsive sources for sharpness.

This is an additional use of an adopted presentation. The canonical artwork and
palette stay at finishing 03; no image generation or new finishing pass is needed.
The sidebar continues to use the transparent 24 px foreground established in 07.
Inspect the empty page in both themes and on mobile; retain synthetic browser
evidence without adding View unit tests or an image-processing dependency.

Verification: four actual Chromium states cover light/dark desktop and mobile.
The hero measures exactly 192/144 px, uses the original 23% radius, and loads the
512 px source at 2x. Downloaded bytes match the checked-in exports. The sidebar
mark remains 24 × 24 px at `(24, 16)`; all four states have no overflow or page
errors, and axe reports zero violations after the theme transition settles.
Visible interface text remains at least 11 px. TypeScript, Biome and the production
build pass. Screenshots and measurements are in the ignored
`output/testing/empty-reading-*` files. No View unit tests were added.

## Social-card metadata

Status: **Removed**, 2026-09-15. Open Graph and Twitter card tags in root
`index.html` (`og:title`, `og:description`, `og:image`, `twitter:card`,
`twitter:image`) were unreachable behind Cloudflare Access: crawlers never see
the authenticated HTML shell, so the tags produced no social preview. The shared
Hexly image at `https://hexly.ai/og/ocelot.jpg` remains the public brand asset
outside this app; Ocelot no longer references it from the reader document head.

`index.html` keeps charset, viewport, theme-color, `noindex, nofollow`, title,
description, favicons and the Apple touch icon. No runtime, routing, branding
asset, or Access behavior change.

Verification: `index.html` contains none of the five removed meta tags and still
serves the retained head entries above. Document 08 no longer lists social
previews as an in-app consumer.
