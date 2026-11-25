import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("KiCad keepouts honor allowTraces", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm" autorouter="auto_local" schematicDisabled>
      <resistor name="R1" resistance="1k" footprint="0603" pcbX={-7} pcbY={0} />
      <resistor name="R2" resistance="1k" footprint="0603" pcbX={7} pcbY={0} />
      <trace from=".R1 > .pin2" to=".R2 > .pin1" />
      <keepout
        shape="rect"
        pcbX={0}
        pcbY={0}
        width="4mm"
        height="12mm"
        layers={["top", "bottom"]}
        allowTraces
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const keepout = circuitJson.find((element) => element.type === "pcb_keepout")
  expect(keepout?.allow_traces).toBe(true)

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
    footprints: "not_allowed",
    pads: "not_allowed",
    tracks: "allowed",
    vias: "not_allowed",
    copperpour: "not_allowed",
  })
})
