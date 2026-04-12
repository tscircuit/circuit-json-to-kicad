import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { KicadPcb } from "kicadts"

test("standalone hole footprint naming", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="50mm" height="50mm">
      <hole pcbX={-10} pcbY={-10} diameter="3mm" />
      <hole pcbX={10} pcbY={10} shape="pill" width="4mm" height="2mm" />
      <hole
        pcbX={0}
        pcbY={0}
        shape="pill"
        width="4mm"
        height="2mm"
        pcbRotation={30}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()

  // Write to assets for future use
  await Bun.write(
    "./debug-output/repro07-standalone-hole-naming.kicad_pcb",
    outputString,
  )

  const kicadPcb = KicadPcb.parse(outputString)[0] as KicadPcb

  const getFp = (name: string) =>
    kicadPcb.footprints.find((f) => f.libraryLink?.includes(name))

  expect(getFp("hole_circle")?.libraryLink).toBe(
    "tscircuit:hole_circle_holeDiameter3mm",
  )
  expect(getFp("hole_pill")?.libraryLink).toBe(
    "tscircuit:hole_pill_holeWidth4mm_holeHeight2mm",
  )
  expect(getFp("hole_rotated_pill")?.libraryLink).toBe(
    "tscircuit:hole_rotated_pill_holeWidth4mm_holeHeight2mm_ccwRotation30deg",
  )
  expect(getFp("hole_rotated_pill")?.fpPads?.[0]?.at?.angle).toBe(30)

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
