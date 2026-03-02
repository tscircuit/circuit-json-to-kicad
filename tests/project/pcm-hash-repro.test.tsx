import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadProConverter,
  CircuitJsonToKicadSchConverter,
} from "lib"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const PROJECT_NAME = "pcm_hash_repro"

const getKicadCliVersion = async (): Promise<string | null> => {
  try {
    const proc = Bun.spawn(["kicad-cli", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    })

    const stdout = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    if (exitCode !== 0) {
      return null
    }

    return stdout.trim()
  } catch {
    return null
  }
}

test("kicad-cli export does not emit PCM package hash errors", async () => {
  const kicadCliVersion = await getKicadCliVersion()

  if (!kicadCliVersion || !kicadCliVersion.startsWith("9.")) {
    return
  }

  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-3} />
      <capacitor name="C1" capacitance="100nF" footprint="0603" pcbX={3} />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const tempDir = await mkdtemp(join(tmpdir(), "pcm-repro-"))

  try {
    const proConverter = new CircuitJsonToKicadProConverter(circuitJson, {
      projectName: PROJECT_NAME,
      schematicFilename: `${PROJECT_NAME}.kicad_sch`,
      pcbFilename: `${PROJECT_NAME}.kicad_pcb`,
    })
    proConverter.runUntilFinished()

    const schConverter = new CircuitJsonToKicadSchConverter(circuitJson)
    schConverter.runUntilFinished()

    const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
    pcbConverter.runUntilFinished()

    const proPath = join(tempDir, `${PROJECT_NAME}.kicad_pro`)
    const schPath = join(tempDir, `${PROJECT_NAME}.kicad_sch`)
    const pcbPath = join(tempDir, `${PROJECT_NAME}.kicad_pcb`)
    const outputDir = join(tempDir, "export")

    await Promise.all([
      writeFile(proPath, proConverter.getOutputString()),
      writeFile(schPath, schConverter.getOutputString()),
      writeFile(pcbPath, pcbConverter.getOutputString()),
    ])

    const exportResult =
      await Bun.$`kicad-cli pcb export svg ${pcbPath} -o ${join(
        outputDir,
        "pcm-repro.svg",
      )}`

    expect(exportResult.exitCode).toBe(0)
    expect(exportResult.stderr.toString()).not.toContain(
      "Packages hash doesn't match",
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
