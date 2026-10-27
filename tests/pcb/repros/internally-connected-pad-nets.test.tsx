import { expect, test } from "bun:test"
import type { SourceComponentBase, SourcePort } from "circuit-json"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { SmdUsbC } from "./assets/smd-usb-c-obj-only"

test("export nets for internally connected pads", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="14mm" height="10mm" routingDisabled schematicDisabled>
      <SmdUsbC name="J1" />
      <trace from=".J1 > .pin1" to="net.GND" />
    </board>,
  )
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const sourceComponent = circuitJson.find(
    (element) => element.type === "source_component" && element.name === "J1",
  ) as SourceComponentBase | undefined
  const sourcePorts = circuitJson.filter(
    (element) => element.type === "source_port",
  ) as SourcePort[]
  const internallyConnectedPinNumbers =
    sourceComponent?.internally_connected_source_port_ids?.map((group) =>
      group.map(
        (portId) =>
          sourcePorts.find((port) => port.source_port_id === portId)
            ?.pin_number,
      ),
    ) ?? []
  expect(internallyConnectedPinNumbers).toContainEqual([1, 15])

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const pcb = KicadPcb.parse(output)[0] as KicadPcb
  const pads = pcb.footprints[0]!.fpPads.filter(
    (pad) => pad.number === "1" || pad.number === "15",
  )

  expect(
    pads.map((pad) => ({
      number: pad.number,
      net: pad.net?.name ?? null,
    })),
  ).toMatchSnapshot()
})
