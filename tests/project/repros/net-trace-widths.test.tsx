import { expect, test } from "bun:test"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadProConverter,
} from "lib"
import { parseKicadPcb } from "kicadts"
import { Circuit } from "tscircuit"

const NetTraceWidthsRepro = () => (
  <board
    width="20mm"
    height="20mm"
    routingDisabled
    minViaPadDiameter="0.6mm"
    minViaHoleDiameter="0.3mm"
  >
    <net name="MOTOR_PHASE" nominalTraceWidth="2mm" />
    <net name="LOGIC_3V3" nominalTraceWidth="0.3mm" />
    <resistor
      name="R1"
      resistance="1k"
      footprint="0402"
      connections={{ pin1: "net.MOTOR_PHASE", pin2: "net.LOGIC_3V3" }}
    />
  </board>
)

export default NetTraceWidthsRepro

test("source net trace widths are preserved as KiCad netclass patterns", async () => {
  const circuit = new Circuit()
  circuit.add(<NetTraceWidthsRepro />)
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadProConverter(circuitJson, {
    projectName: "net-trace-width-repro",
  })
  const sourceNets = circuitJson
    .filter((element) => element.type === "source_net")
    .map(({ name, trace_width }) => ({ name, trace_width }))
    .filter(
      (net): net is { name: string; trace_width: number } =>
        net.trace_width !== undefined,
    )
  const generatedProject = JSON.parse(
    converter.getOutputString(),
  ) as ReturnType<typeof converter.getOutput>
  const generatedNetSettings = generatedProject.net_settings
  const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcbConverter.runUntilFinished()
  const exportedPcbNetNames = parseKicadPcb(pcbConverter.getOutputString())
    .nets.map((net) => net.name)
    .filter(Boolean)
    .sort()

  expect(generatedNetSettings.meta.version).toBe(3)
  expect(generatedNetSettings.classes).toEqual([
    {
      clearance: 0.1,
      name: "Default",
      track_width: 0.1,
      via_diameter: 0.6,
      via_drill: 0.3,
    },
    {
      clearance: 0.1,
      name: "Trace Width 0.3 mm",
      track_width: 0.3,
      via_diameter: 0.6,
      via_drill: 0.3,
    },
    {
      clearance: 0.1,
      name: "Trace Width 2 mm",
      track_width: 2,
      via_diameter: 0.6,
      via_drill: 0.3,
    },
  ])
  expect(generatedNetSettings.netclass_patterns).toEqual([
    {
      netclass: "Trace Width 2 mm",
      pattern: "/MOTOR_PHASE",
    },
    {
      netclass: "Trace Width 0.3 mm",
      pattern: "LOGIC_3V3",
    },
  ])
  expect(
    generatedNetSettings.netclass_patterns.map(({ pattern }) => pattern).sort(),
  ).toEqual(exportedPcbNetNames)

  expect({
    sourceNets,
    generatedNetSettings,
    exportedPcbNetNames,
  }).toMatchSnapshot()
})

test("conflicting widths for the same exported KiCad net name are rejected", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <subcircuit name="BLOCK_A">
        <net name="SENSE" nominalTraceWidth="0.2mm" />
        <resistor
          name="R1"
          resistance="1k"
          footprint="0402"
          connections={{ pin1: "net.SENSE", pin2: "net.GND" }}
        />
      </subcircuit>
      <subcircuit name="BLOCK_B">
        <net name="SENSE" nominalTraceWidth="0.5mm" />
        <resistor
          name="R1"
          resistance="1k"
          footprint="0402"
          connections={{ pin1: "net.SENSE", pin2: "net.GND" }}
        />
      </subcircuit>
    </board>,
  )
  await circuit.renderUntilSettled()

  expect(
    () =>
      new CircuitJsonToKicadProConverter(circuit.getCircuitJson(), {
        projectName: "conflicting-net-trace-widths",
      }),
  ).toThrow(
    'Cannot preserve conflicting trace widths for KiCad net "/SENSE": Trace Width 0.2 mm and Trace Width 0.5 mm',
  )
})
