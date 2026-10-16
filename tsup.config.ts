import { defineConfig } from "tsup"

export default defineConfig({
  // The pinned Git dependency needs a trusted prepare script to create dist.
  // Bundle its exact implementation and public types so consumers need no build scripts.
  noExternal: ["kicadts"],
  dts: {
    resolve: ["kicadts"],
    compilerOptions: {
      paths: { kicadts: ["./node_modules/kicadts/dist/index.d.ts"] },
    },
  },
})
