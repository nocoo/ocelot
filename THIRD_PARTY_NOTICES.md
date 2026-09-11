# Third-party references and assets

Ocelot uses the published packages pinned in `package.json` and `bun.lock`.
Their upstream licenses continue to apply. In particular:

| Project | Use | License / notice |
| --- | --- | --- |
| [Basalt](https://github.com/nocoo/basalt) 2.1.7 | Controls and application layout | [MIT](public/licenses/basalt.txt) |
| [Pierre Trees](https://github.com/pierrecomputer/pierre) 1.0.0-beta.6 | Read-only file navigation | [Apache-2.0](public/licenses/pierre.txt), [upstream notice including headless-tree](public/licenses/pierre-notice.txt) |
| [Source Serif 4](https://github.com/adobe-fonts/source-serif) via Fontsource 5.3.0 | Unmodified self-hosted Latin font files | [OFL-1.1](public/licenses/source-serif-4.txt) |
| [Kami](https://github.com/tw93/Kami) | Chinese/English typography reference | [MIT upstream](https://github.com/tw93/Kami/blob/main/LICENSE) |
| [Primer Octicons](https://github.com/primer/octicons) | GitHub repository icon (`mark-github-16`) | [MIT](public/licenses/octicons.txt) |

The license copies above are also included in the built site's `licenses/` directory.
Ocelot adapts Kami's hierarchy, measure, paragraph rhythm, and font fallback principles
to screen reading with a cool blue-gray palette. It does not redistribute Kami's
Tsanger font. Chinese glyphs use the reader's available system serif fonts.

React, Lucide, Mermaid, KaTeX, unified/remark/rehype, YAML, and jose are used under
their published permissive licenses. Dependency source and license files remain
available through their exact package versions in the lockfile.

The landscape fixture, example notes, and Ocelot's SVG mark are original project
assets. Research projects in [03](docs/03-reference-projects.md) informed architecture;
their application implementations and private vault content were not copied.
