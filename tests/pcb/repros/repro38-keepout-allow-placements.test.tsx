import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test.failing("KiCad keepouts honor allowPlacements", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="14mm" height="10mm" routingDisabled schematicDisabled>
      <resistor name="R1" resistance="1k" footprint="0402" />
      <keepout shape="rect" width="3mm" height="3mm" allowPlacements />
    </board>,
  )
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const keepout = circuitJson.find((element) => element.type === "pcb_keepout")
  expect(keepout?.allow_placements).toBe(true)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const { zones } = parseKicadPcb(converter.getOutputString())

  expect(zones).toHaveLength(1)
  const rule = zones[0]?.keepout
  expect({
    footprints: rule?.footprints,
    pads: rule?.pads,
    tracks: rule?.tracks,
    vias: rule?.vias,
    copperpour: rule?.copperpour,
  }).toEqual({
    footprints: "allowed",
    pads: "allowed",
    tracks: "not_allowed",
    vias: "not_allowed",
    copperpour: "not_allowed",
  })
})
