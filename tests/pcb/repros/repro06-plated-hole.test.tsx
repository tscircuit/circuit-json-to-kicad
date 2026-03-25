import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { KicadPcb } from "kicadts"

test("pcb repro06 plated hole", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="50mm" height="50mm">
      <platedhole
        pcbX={-20}
        pcbY={-20}
        holeDiameter="2mm"
        outerDiameter="4mm"
        shape="circle"
      />
      <resistor name="R1" resistance="10k" pcbX={0} pcbY={0} footprint="0402" />
      <capacitor
        name="C1"
        capacitance="100nF"
        pcbX={5}
        pcbY={0}
        footprint="0402"
      />
      <platedhole
        pcbX={20}
        pcbY={20}
        holeDiameter="2mm"
        outerDiameter="4mm"
        shape="circle"
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)

  converter.runUntilFinished()

  const outputString = converter.getOutputString()

  Bun.write("./debug-output/plated-hole.kicad_pcb", outputString)

  const kicadPcb = KicadPcb.parse(outputString)[0] as KicadPcb

  // There are 4 footprints: R1, C1, and 2 standalone plated holes
  expect(kicadPcb.footprints.length).toBe(4)

  const totalHoles = kicadPcb.footprints.reduce(
    (acc, f) => acc + f.fpPads.filter((p) => p.padType === "thru_hole").length,
    0,
  )

  // Verify that there are 2 thru_hole pads (one per plated hole)
  expect(totalHoles).toBe(2)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: outputString,
    kicadFileType: "pcb",
  })

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson: circuitJson,
        outputType: "pcb",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
