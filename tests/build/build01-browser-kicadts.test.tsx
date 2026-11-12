import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { basename, join } from "node:path"
import { pathToFileURL } from "node:url"
import { KicadPcb, KicadSch } from "kicadts"
import { Circuit } from "tscircuit"

test("the browser build embeds kicadts while the default build shares its classes", async () => {
  const repository = join(import.meta.dir, "../..")
  const directory = await mkdtemp(join(repository, "node_modules/.cdn-build-"))
  try {
    const result = Bun.spawnSync(
      [process.execPath, "run", "build", "--out-dir", directory],
      { cwd: repository },
    )
    if (result.exitCode !== 0) {
      throw new Error(result.stdout.toString() + result.stderr.toString())
    }

    const manifest = await Bun.file(join(repository, "package.json")).json()
    const browserPath = join(
      directory,
      basename(manifest.browser ?? manifest.main),
    )
    const defaultPath = join(directory, basename(manifest.main))
    const scanner = new Bun.Transpiler({ loader: "js" })
    const browserImports = scanner.scanImports(
      await readFile(browserPath, "utf8"),
    )
    expect(
      browserImports.filter(({ path }) => /^kicadts(?:\/|$)/.test(path)),
    ).toEqual([])
    const defaultImports = scanner.scanImports(
      await readFile(defaultPath, "utf8"),
    )
    expect(defaultImports.map(({ path }) => path)).toContain("kicadts")

    const circuit = new Circuit()
    circuit.add(
      <board width={20} height={10} routingDisabled>
        <resistor
          name="R1"
          resistance="1k"
          footprint="0402"
          pcbX={-2}
          schX={-2}
        />
        <capacitor
          name="C1"
          capacitance="100nF"
          footprint="0402"
          pcbX={2}
          schX={2}
        />
        <trace from=".R1 > .pin2" to=".C1 > .pin1" />
      </board>,
    )
    await circuit.renderUntilSettled()

    for (const path of [browserPath, defaultPath]) {
      const { CircuitJsonToKicadPcbConverter, CircuitJsonToKicadSchConverter } =
        await import(pathToFileURL(path).href)
      const pcb = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
      const sch = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
      pcb.runUntilFinished()
      sch.runUntilFinished()
      expect(pcb.getOutputString()).toContain("(kicad_pcb")
      expect(sch.getOutputString()).toContain("(kicad_sch")
      for (const name of ["R1", "C1"]) {
        expect(pcb.getOutputString()).toContain(`"${name}"`)
        expect(sch.getOutputString()).toContain(`"${name}"`)
      }
      if (path === defaultPath) {
        expect(pcb.getOutput()).toBeInstanceOf(KicadPcb)
        expect(sch.getOutput()).toBeInstanceOf(KicadSch)
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 60_000)
