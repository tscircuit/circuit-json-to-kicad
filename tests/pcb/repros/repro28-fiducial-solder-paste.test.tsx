import { expect, test } from "bun:test"
import type { PcbSmtPad, PcbSolderPaste } from "circuit-json"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const Repro28FiducialSolderPaste = () => (
  <board width="20mm" height="20mm">
    <resistor name="R1" resistance="1k" footprint="0402" pcbX={-6} pcbY={0} />
    <trace from=".R1 > .pin1" to="net.GND" />
    <fiducial
      name="FID1"
      padDiameter="1mm"
      soldermaskPullback="0.5mm"
      pcbX={5}
      pcbY={0}
    />
    <copperpour connectsTo="net.GND" layer="top" />
  </board>
)

export default Repro28FiducialSolderPaste

const createRepro28CircuitJson = async () => {
  const circuit = new Circuit()
  circuit.add(<Repro28FiducialSolderPaste />)
  await circuit.renderUntilSettled()

  return circuit.getCircuitJson()
}

test(
  "pcb repro28 fiducial solder-paste snapshot",
  async () => {
    const circuitJson = await createRepro28CircuitJson()
    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()

    const kicadSnapshot = await takeKicadSnapshot({
      kicadFileContent: converter.getOutputString(),
      kicadFileType: "pcb",
    })

    expect(kicadSnapshot.exitCode).toBe(0)
    expect(
      stackCircuitJsonKicadPngs(
        await takeCircuitJsonSnapshot({
          circuitJson,
          outputType: "pcb",
        }),
        kicadSnapshot.generatedFileContent["temp_file.png"]!,
      ),
    ).toMatchPngSnapshot(import.meta.path)
  },
  { timeout: 120000 },
)

test("pcb repro28 fiducial without pcb_solder_paste omits F.Paste", async () => {
  const circuitJson = await createRepro28CircuitJson()
  const pcbSmtPads = circuitJson.filter(
    (element): element is PcbSmtPad => element.type === "pcb_smtpad",
  )
  const pcbSolderPastes = circuitJson.filter(
    (element): element is PcbSolderPaste => element.type === "pcb_solder_paste",
  )

  const fiducialPad = pcbSmtPads.find((pad) => !pad.pcb_component_id)
  expect(fiducialPad).toBeDefined()
  expect(
    pcbSolderPastes.some(
      (paste) => paste.pcb_smtpad_id === fiducialPad!.pcb_smtpad_id,
    ),
  ).toBe(false)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const kicadPcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
  const resistorFootprint = kicadPcb.footprints.find(
    (footprint) => footprint.libraryLink === "tscircuit:resistor_res0402",
  )
  const fiducialFootprint = kicadPcb.footprints.find(
    (footprint) =>
      footprint.libraryLink === "tscircuit:smtpad_circle_diameter1mm",
  )

  expect(resistorFootprint).toBeDefined()
  expect(
    resistorFootprint!.fpPads.every((pad) =>
      pad.layers?.layers.includes("F.Paste"),
    ),
  ).toBe(true)
  expect(fiducialFootprint).toBeDefined()
  expect(fiducialFootprint!.fpPads[0]!.layers?.layers).toEqual([
    "F.Cu",
    "F.Mask",
  ])
})
