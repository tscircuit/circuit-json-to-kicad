import { expect, test } from "bun:test"
import type { SourcePort } from "circuit-json"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro29: do-not-connect source pins emit KiCad no-connect markers", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled>
      <chip
        name="U1"
        pinLabels={{
          pin1: "IN",
          pin2: "OUT",
          pin3: "NC1",
          pin4: "NC2",
        }}
        noConnect={["NC1", "NC2"]}
        schPinArrangement={{
          leftSide: {
            direction: "top-to-bottom",
            pins: ["IN", "NC1"],
          },
          rightSide: {
            direction: "top-to-bottom",
            pins: ["OUT", "NC2"],
          },
        }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const doNotConnectPorts = circuitJson.filter(
    (element): element is SourcePort =>
      element.type === "source_port" && element.do_not_connect === true,
  )
  expect(doNotConnectPorts.map((port) => port.name).sort()).toEqual([
    "NC1",
    "NC2",
  ])

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const schematic = parseKicadSch(output)
  expect(
    schematic.noConnects.map((marker) => [marker.at?.x, marker.at?.y]),
  ).toMatchInlineSnapshot(`[]`)

  await Bun.write(
    "./debug-output/repro29-do-not-connect-markers.kicad_sch",
    output,
  )
  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })
  expect(kicadSnapshot.exitCode).toBe(0)
  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson,
        outputType: "schematic",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)
