import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test("pcb keepouts export as KiCad keepout zones", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <keepout shape="rect" pcbX={0} pcbY={0} width="2.4mm" height="5mm" />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()
  expect(outputString).toContain("(keepout")
  expect(outputString).toContain("(tracks not_allowed)")
  expect(outputString).toContain("(vias not_allowed)")
  expect(outputString).toContain("(pads not_allowed)")
  expect(outputString).toContain("(copperpour not_allowed)")
  expect(outputString).toContain("(footprints not_allowed)")

  const kicadPcbFixture = await readFile(
    "tests/assets/keepout.kicad_pcb",
    "utf8",
  )
  expect(kicadPcbFixture).toContain("(keepout")

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: kicadPcbFixture,
    kicadFileType: "pcb",
  })

  expect(
    await stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
