import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { isBuiltin } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Circuit } from "tscircuit"
import ts from "typescript"

function run(args: string[], cwd: string) {
  const result = Bun.spawnSync(args, { cwd })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString() + result.stdout.toString())
  }
  return result.stdout.toString()
}

function expectDeclaredImport(path: string) {
  expect(path === "@tscircuit/circuit-json-util" || isBuiltin(path)).toBe(true)
}

function visit(node: ts.Node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    expectDeclaredImport(node.moduleSpecifier.text)
  }
  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteral(node.argument.literal)
  ) {
    expectDeclaredImport(node.argument.literal.text)
  }
  ts.forEachChild(node, visit)
}

test("the packed package converts circuits in isolated Bun and Node consumers", async () => {
  const repository = join(dirname(fileURLToPath(import.meta.url)), "..")
  const consumer = await mkdtemp(join(tmpdir(), "kicad-standalone-"))
  try {
    run([process.execPath, "run", "build"], repository)
    const javascript = await readFile(join(repository, "dist/index.js"), "utf8")
    for (const { path } of new Bun.Transpiler().scanImports(javascript)) {
      expectDeclaredImport(path)
    }
    const declarations = ts.createSourceFile(
      "index.d.ts",
      await readFile(join(repository, "dist/index.d.ts"), "utf8"),
      ts.ScriptTarget.Latest,
      true,
    )
    visit(declarations)

    run([process.execPath, "pm", "pack", "--destination", consumer], repository)
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
    run([process.execPath, "install", "--production"], consumer)
    const circuit = new Circuit()
    circuit.add(
      <board width={20} height={10} routingDisabled>
        <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} />
        <capacitor name="C1" capacitance="100nF" footprint="0402" pcbX={2} />
        <trace from=".R1 > .pin2" to=".C1 > .pin1" />
      </board>,
    )
    await circuit.renderUntilSettled()
    await writeFile(
      join(consumer, "circuit.json"),
      JSON.stringify(circuit.getCircuitJson()),
    )
    await writeFile(
      join(consumer, "consumer.mjs"),
      `import { readFileSync } from "node:fs";
import { CircuitJsonToKicadSchConverter, CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad";
const circuitJson = JSON.parse(readFileSync(new URL("./circuit.json", import.meta.url), "utf8"));
for (const [Converter, marker] of [[CircuitJsonToKicadSchConverter, "kicad_sch"], [CircuitJsonToKicadPcbConverter, "kicad_pcb"]]) {
  const converter = new Converter(circuitJson);
  converter.runUntilFinished();
  const output = converter.getOutputString();
  if (!output.includes(marker) || !output.includes("R1") || !output.includes("C1")) throw new Error("Missing circuit output");
}`,
    )
    run([process.execPath, "--no-install", "consumer.mjs"], consumer)
    run(["node", "consumer.mjs"], consumer)
    await writeFile(
      join(consumer, "consumer.ts"),
      `import { CircuitJsonToKicadSchConverter } from "circuit-json-to-kicad";
const converter = new CircuitJsonToKicadSchConverter([]);
const output: string = converter.getOutput().getString();
// @ts-expect-error The KiCad output must retain its class type.
converter.getOutput().nonexistentMethod();
// @ts-expect-error The circuit input must retain its Circuit JSON type.
new CircuitJsonToKicadSchConverter("invalid circuit");
const matrix = converter.currentStage?.ctx.c2kMatSch;
if (matrix) {
  const a: number = matrix.a;
  // @ts-expect-error Matrix coefficients must retain their numeric type.
  const wrong: string = matrix.a;
}`,
    )
    run(
      [
        process.execPath,
        "node_modules/typescript/bin/tsc",
        "--noEmit",
        "--strict",
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
