import { expect, test } from "bun:test"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("standalone vias do not export an extra anonymous footprint", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="6mm" schematicDisabled>
      <net name="GND" />
      <via
        name="VGND"
        pcbX={-2}
        pcbY={0}
        holeDiameter="0.3mm"
        outerDiameter="0.6mm"
        connectsTo="net.GND"
      />
      <resistor name="R1" pcbX={2} resistance="1k" footprint="0402" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  // The via has a PCB container in addition to the resistor's component.
  expect(
    circuitJson.filter((element) => element.type === "pcb_component"),
  ).toHaveLength(2)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const outputString = converter.getOutputString()
  const kicadPcb = KicadPcb.parse(outputString)[0] as KicadPcb

  expect(kicadPcb.footprints).toHaveLength(1)
  expect(
    kicadPcb.footprints.map((footprint) => ({
      libraryLink: footprint.libraryLink,
      reference:
        footprint.properties.find((property) => property.key === "Reference")
          ?.value ?? null,
      padCount: footprint.fpPads.length,
    })),
  ).toMatchInlineSnapshot(`
    [
      {
        "libraryLink": "tscircuit:resistor_res0402",
        "padCount": 2,
        "reference": "R1",
      },
    ]
  `)

  expect(kicadPcb.vias).toHaveLength(1)
  const via = kicadPcb.vias[0]!
  expect({
    x: via.at?.x,
    y: via.at?.y,
    diameter: via.size,
    drill: via.drill,
    layers: via.layers?.names,
    net: kicadPcb.nets.find((net) => net.id === via.net?.id)?.name,
  }).toEqual({
    x: 98,
    y: 100,
    diameter: 0.6,
    drill: 0.3,
    layers: ["F.Cu", "B.Cu"],
    net: "GND",
  })

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: outputString,
    kicadFileType: "pcb",
    pcbDrillHoleColor: "white",
    generatePng: false,
  })
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      await sharp(kicadSnapshot.generatedFileContent["temp_file.svg"]!)
        .resize({ width: 800 })
        .flatten({ background: "#000" })
        .png()
        .toBuffer(),
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 120000)
