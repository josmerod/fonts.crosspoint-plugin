# fonts.crosspoint-plugin

CrossPoint plugin: browse, preview and install precompiled `.cpfont` font
families (6–18 pt) on Xteink readers running CrossPoint.

The installable payload lives in [`fonts.crosspoint-plugin/`](fonts.crosspoint-plugin/)
— the layout the [CrossPoint Plugin Hub](https://github.com/crosspoint-reader/crosspoint-plugin-hub)
discovers automatically. Everything else here is development material.

- **Users**: install from **Home → Plugins** on the reader, or see the plugin's
  [README](fonts.crosspoint-plugin/README.md).
- **Fonts**: the catalog is built by [josmerod/cp-fonts](https://github.com/josmerod/cp-fonts);
  this plugin only consumes it, so new families appear without a plugin release.

## Development

```sh
npm test          # plugin behaviour + manifest contract
```

Layout:

```
fonts.crosspoint-plugin/   installable payload (the only thing the hub ships)
tests/                     node:test suite
.github/workflows/ci.yml   tests + manifest validation on push/PR
.github/workflows/release.yml  tag vX.Y.Z → GitHub Release (tag must match manifest)
```

## Releasing

1. Bump `version` in `fonts.crosspoint-plugin/manifest.json`.
2. Commit, tag `v<version>`, push the tag. The release workflow verifies the tag
   matches the manifest and publishes the Release the Plugin Hub pins to.
3. Wait for the hub's catalog refresh (every 3 h) — no pull request needed.

This plugin's code is MIT. Font licenses live with each family in cp-fonts.
