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

  // R1, C1, and two plated holes remain conductive footprints. The unowned
  // apertures on both sides of each hole use separate board-only footprints.
  const conductiveFootprints = kicadPcb.footprints.filter((footprint) =>
    footprint.fpPads.some((pad) =>
      pad.layers?.layers.some((layer) => layer.endsWith(".Cu")),
    ),
  )
  expect(conductiveFootprints).toHaveLength(4)
  const pasteFootprints = kicadPcb.footprints.filter(
    (footprint) => !conductiveFootprints.includes(footprint),
  )
  expect(pasteFootprints).toHaveLength(4)
  for (const footprint of pasteFootprints) {
    expect(footprint.attr?.boardOnly).toBe(true)
    expect(footprint.attr?.excludeFromBom).toBe(true)
    expect(footprint.attr?.excludeFromPosFiles).toBe(true)
    expect(footprint.fpPads).toHaveLength(1)
    const aperture = footprint.fpPads[0]!
    expect(aperture.layers?.layers).toHaveLength(1)
    expect(["F.Paste", "B.Paste"]).toContain(aperture.layers!.layers[0]!)
    expect(aperture.number).toBe("")
    expect(aperture.net).toBeUndefined()
    expect(aperture.drill).toBeUndefined()
  }

  const totalHoles = kicadPcb.footprints.reduce(
    (acc, f) => acc + f.fpPads.filter((p) => p.padType === "thru_hole").length,
    0,
  )

  // Verify that there are 2 thru_hole pads (one per plated hole)
  expect(totalHoles).toBe(2)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: outputString,
    kicadFileType: "pcb",
    pcbDrillHoleColor: "white",
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
