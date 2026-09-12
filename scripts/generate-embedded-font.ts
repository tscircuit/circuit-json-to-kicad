import base64Font from "@tscircuit/alphabet/base64font"
import { createHash } from "node:crypto"
import { writeFileSync } from "node:fs"

const font = Buffer.from(base64Font, "base64")
// KiCad requires a Zstandard frame with its uncompressed content size.
const compressed = Buffer.from(Bun.zstdCompressSync(font)).toString("base64")
// KiCad 9/10 accept SHA-256 checksums for embedded files.
const checksum = createHash("sha256").update(font).digest("hex")
writeFileSync(
  new URL("../lib/fonts/alphabetFontData.ts", import.meta.url),
  `// Generated from @tscircuit/alphabet/base64font by bun run generate:embedded-font.\n// Precompressed so conversion works synchronously in browsers and Node.js.\nexport const alphabetFontChecksum =\n  "${checksum}"\nexport const alphabetFontData =\n  "${compressed}"\n`,
)
