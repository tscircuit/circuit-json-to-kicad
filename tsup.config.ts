import { defineConfig } from "tsup"

export default defineConfig([
  {
    entry: ["lib/index.ts"],
    format: ["esm"],
    dts: true,
  },
  {
    entry: { "index.browser": "lib/index.ts" },
    format: ["esm"],
    platform: "browser",
    // CDNs cannot resolve the Git-pinned kicadts dependency as an npm version.
    // Keep the default build external so Node consumers share kicadts classes.
    noExternal: ["kicadts"],
  },
])
