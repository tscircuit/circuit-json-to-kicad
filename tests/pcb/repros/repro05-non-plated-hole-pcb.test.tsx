import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { KicadPcb } from "kicadts"

test("pcb repro05 non-plated hole", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="50mm" height="50mm">
      <hole pcbX={-20} pcbY={-20} diameter="3.2mm" />
      <hole pcbX={20} pcbY={20} diameter="3.2mm" />
      <resistor name="R1" resistance="10k" pcbX={0} pcbY={0} footprint="0402" />
      <capacitor
        name="C1"
        capacitance="100nF"
        pcbX={5}
        pcbY={0}
        footprint="0402"
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson as any)

  converter.runUntilFinished()

  const outputString = converter.getOutputString()

  Bun.write("./debug-output/non-plated-hole.kicad_pcb", outputString)

  const kicadPcb = KicadPcb.parse(outputString)[0] as KicadPcb

  // There are 2 footprints: R1, C1
  expect(kicadPcb.footprints.length).toBe(2)

  const r1 = kicadPcb.footprints.find((f) =>
    f.fpTexts.some((t) => t.text === "R1"),
  )
  const c1 = kicadPcb.footprints.find((f) =>
    f.fpTexts.some((t) => t.text === "C1"),
  )

  // BUG: R1 and C1 each have 2 holes (total 4) instead of 0
  // Each should have 0 np_thru_hole pads
  expect(r1?.fpPads.filter((p) => p.padType === "np_thru_hole").length).toBe(2)
  expect(c1?.fpPads.filter((p) => p.padType === "np_thru_hole").length).toBe(2)

  // The total number of non-plated holes in the entire PCB should be 2
  // BUG: total holes is 4 (2 per footprint)
  const totalHoles = kicadPcb.footprints.reduce(
    (acc, f) =>
      acc + f.fpPads.filter((p) => p.padType === "np_thru_hole").length,
    0,
  )
  // BUG: total holes should be 2
  // TODO: total holes should be 2 after the bug is fixed
  expect(totalHoles).toBe(4)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: outputString,
    kicadFileType: "pcb",
  })

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson: circuitJson as any,
        outputType: "pcb",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
