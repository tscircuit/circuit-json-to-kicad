import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import type { PartsEngine } from "@tscircuit/props"
import type { AnyCircuitElement } from "circuit-json"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import usbCC165948CircuitJson from "tests/assets/usb-c-C165948.circuit.json"

test("sch basics06 usb-c connector", async () => {
  const fetchPartCircuitJsonCalls: Array<{
    manufacturerPartNumber?: string
    supplierPartNumber?: string
  }> = []

  const partsEngine: PartsEngine = {
    findPart: ({ sourceComponent }) => {
      if (
        sourceComponent.type === "source_component" &&
        "ftype" in sourceComponent &&
        sourceComponent.ftype === "simple_connector" &&
        "standard" in sourceComponent &&
        sourceComponent.standard === "usb_c"
      ) {
        return { jlcpcb: ["C165948"] }
      }
      return {}
    },
    fetchPartCircuitJson: (params: {
      manufacturerPartNumber?: string
      supplierPartNumber?: string
      platformFetch?: typeof fetch
    }) => {
      fetchPartCircuitJsonCalls.push(params)
      if (params.supplierPartNumber === "C165948") {
        return usbCC165948CircuitJson as AnyCircuitElement[]
      }
      return undefined
    },
  }

  const circuit = new Circuit()
  circuit.add(
    <board partsEngine={partsEngine}>
      <connector
        name="U1"
        standard="usb_c"
        manufacturerPartNumber="TYPE-C-31-M-12"
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const sourcePorts = circuitJson.filter(
    (elm): elm is Extract<AnyCircuitElement, { type: "source_port" }> =>
      elm.type === "source_port",
  )
  const schematicPorts = circuitJson.filter(
    (elm): elm is Extract<AnyCircuitElement, { type: "schematic_port" }> =>
      elm.type === "schematic_port",
  )

  expect(fetchPartCircuitJsonCalls.length).toBeGreaterThan(0)
  expect(
    fetchPartCircuitJsonCalls.some(
      (call) => call.supplierPartNumber === "C165948",
    ),
  ).toBe(true)
  expect(sourcePorts.length).toBeGreaterThan(0)
  expect(schematicPorts.length).toBeGreaterThan(0)

  const hasHint = (hint: string) =>
    sourcePorts.some(
      (sp) => Array.isArray(sp.port_hints) && sp.port_hints.includes(hint),
    )
  expect(hasHint("CC1")).toBe(true)
  expect(hasHint("CC2")).toBe(true)
  expect(hasHint("GND1")).toBe(true)
  expect(hasHint("GND2")).toBe(true)
  expect(hasHint("VBUS1")).toBe(true)
  expect(hasHint("VBUS2")).toBe(true)
  expect(hasHint("DM1")).toBe(true)
  expect(hasHint("DM2")).toBe(true)
  expect(hasHint("DP1")).toBe(true)
  expect(hasHint("DP2")).toBe(true)
  expect(hasHint("SBU1")).toBe(true)
  expect(hasHint("SBU2")).toBe(true)

  Bun.write("./debug-output/circuit.json", JSON.stringify(circuitJson, null, 2))

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  await converter.runUntilFinished()

  Bun.write("./debug-output/kicad.kicad_sch", converter.getOutputString())

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "schematic" }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
