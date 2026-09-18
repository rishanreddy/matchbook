# Matchbook mark

`matchbook-mark.svg` is the source of truth for the app icon: a matchbook cover
holding three matches above an amber strike strip. Three matches because an FRC
alliance is three robots. `matchbook-mark-light.svg` is the same geometry for light
backgrounds.

The in-app version lives separately in `src/renderer/src/components/BrandIcon.tsx` so
it can take its colours from the theme. **If you change the mark here, change it there
too** — they are the same 32-unit grid, so the path data copies across directly.

## Regenerating the platform icons

`build/icon.icns`, `build/icon.ico`, `build/icon.png`, `resources/icon.png`, and
`src/renderer/public/favicon.ico` are all generated from a 1024×1024 render of this
file. There is no rasterizer in the toolchain, so the render is done with headless
Chrome:

1. Put the SVG in an HTML page sized to exactly 1024×1024 on a transparent background,
   with the mark centred on a rounded-square backdrop (`#232b35` → `#11151a`, corner
   radius 188, inset 92 on all sides).
2. Screenshot it to `icon-1024.png`.
3. macOS: `sips -z <N> <N>` into a `.iconset` directory at 16/32/64/128/256/512/1024,
   named per Apple's `icon_16x16@2x.png` convention, then `iconutil -c icns`.
4. Windows: `sips` to 16/32/48/64/128/256 and pack the PNGs into an `.ico` container.
5. Linux/renderer: `sips -z 512 512` and `-z 256 256` respectively.

Keep the strike strip flush inside the cover outline (`M6 23.5h20` against a rect from
x=5 width=22 with a 2px stroke). Extending it past the outline reads as a rendering
bug at large sizes.
