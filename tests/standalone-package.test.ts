import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// A real packed consumer catches undeclared imports hidden by this repo's devDependencies.
test("the packed package imports with only production dependencies", async () => {
  const repository = join(dirname(fileURLToPath(import.meta.url)), "..")
  const consumer = await mkdtemp(join(tmpdir(), "kicad-standalone-"))
  const run = (args: string[], cwd: string) => {
    const result = Bun.spawnSync([process.execPath, ...args], { cwd })
    expect(result.stderr.toString() + result.stdout.toString()).not.toContain(
      "Cannot find module",
    )
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.toString() + result.stdout.toString())
    }
    return result.stdout.toString()
  }
  try {
    run(["run", "build"], repository)
    run(["pm", "pack", "--destination", consumer], repository)
    const tarball = Array.from(new Bun.Glob("*.tgz").scanSync(consumer))[0]!
    await writeFile(
      join(consumer, "package.json"),
      JSON.stringify({
        private: true,
        type: "module",
        dependencies: {
          "circuit-json-to-kicad": `file:./${tarball}`,
          typescript: "5.9.3",
        },
      }),
    )
    run(["install", "--production"], consumer)
    run(
      [
        "--no-install",
        "--eval",
        'const { CircuitJsonToKicadSchConverter } = await import("circuit-json-to-kicad"); const converter = new CircuitJsonToKicadSchConverter([]); converter.runUntilFinished(); if (!converter.getOutputString().includes("kicad_sch")) throw new Error("Missing schematic output")',
      ],
      consumer,
    )
    await writeFile(
      join(consumer, "consumer.ts"),
      'import { CircuitJsonToKicadSchConverter } from "circuit-json-to-kicad"; const converter = new CircuitJsonToKicadSchConverter([]); const output: string = converter.getOutputString();',
    )
    run(
      [
        "node_modules/typescript/bin/tsc",
        "--noEmit",
        "--moduleResolution",
        "bundler",
        "--module",
        "esnext",
        "--target",
        "esnext",
        "--skipLibCheck",
        "consumer.ts",
      ],
      consumer,
    )
  } finally {
    await rm(consumer, { recursive: true, force: true })
  }
}, 120_000)
