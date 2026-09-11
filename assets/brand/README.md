# Ocelot brand assets

The owner-approved identity is a warm-gold ocelot portrait watching one folded-paper bird. Its connected flat facets, dark markings and both eyes remain intact. The shoulder naturally enters through the bottom and lower-left edges.

| File | Role |
| --- | --- |
| `../../logo.png` | Exact 2048 px transparent master |
| `icon.png` | Exact square presentation with paper and contact shadows |
| `icon-rounded.png` | Exact rounded presentation; use at 128 px in both README headers |
| `background.png` | Independent rosette and turned-page paper field |
| `../../public/logo-{80,160}.png` | Transparent application marks for the shared `Mark` component |
| `../../public/favicon-{16,32}.png` | Transparent browser marks |
| `../../public/apple-touch-icon.png` | Square 180 px presentation; the operating system supplies its mask |

Small interface marks have no tile background, extra rounded crop, shadow or color filter. The footer uses the same full-opacity artwork. Root `logo.png` remains the canonical foreground; never replace it with the presentation tile.

[Provenance](provenance.json) records the selected `2026-09-11-01 / 03` study, owner approval, dimensions and exact SHA-256 values. [The Hexly archive](https://github.com/nocoo/hexly.ai/tree/main/artwork/logo-family/ocelot/2026-09-11-01) preserves the original SVG identities, untouched generation, prompt, references, extraction masks, independent layers, every finishing pass and visual checks.

To reproduce these source assets, run the study's `export-source.mjs` from a Hexly checkout with its existing dependencies, passing this repository's absolute path. Ocelot requires no image-processing dependency. The existing blue-gray application theme is separate from the warm artwork and paper palette. See [Visual identity](../../docs/08-visual-identity.md) for consumers and verification.
