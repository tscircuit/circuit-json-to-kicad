- This is a `bun` project, use `bun test path/to/test.test.ts` to run a test
- There are visual PNG snapshots generated for more tests, you should inspect
  images after generating them
- This project converts circuit json into kicad files. Circuit JSON is an
  open-source file format, you can look for elements inside node_modules/circuit-json/README.md
- You can find kicad reference files inside the kicad-demos directory, if that
  directory isn't found, you can run `bun run download-demos` to download it
- Never directly write circuit-json, prefer to use tscircuit to create it
  via `import { Circuit } from "tscircuit"`
- One test per file, and enumerate test file names like `basics01.test.tsx`
- Use kicad/circuit-json visual snapshot tests wherever possible