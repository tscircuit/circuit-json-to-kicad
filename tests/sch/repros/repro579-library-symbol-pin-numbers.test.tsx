import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { Circuit } from "tscircuit"

test("repro579: crystal_4pin maps KiCad pin numbers from circuit pin labels rather than iteration order", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="20mm" height="20mm">
      <crystal
        name="X1"
        frequency="8MHz"
        loadCapacitance="20pF"
        pinVariant="four_pin"
        pcbX={0}
        pcbY={0}
        footprint={
          <footprint>
            <smtpad
              portHints={["1"]}
              pcbX={-1}
              pcbY={-1}
              width={0.8}
              height={0.8}
              shape="rect"
              layer="top"
            />
            <smtpad
              portHints={["2"]}
              pcbX={-1}
              pcbY={1}
              width={0.8}
              height={0.8}
              shape="rect"
              layer="top"
            />
            <smtpad
              portHints={["3"]}
              pcbX={1}
              pcbY={-1}
              width={0.8}
              height={0.8}
              shape="rect"
              layer="top"
            />
            <smtpad
              portHints={["4"]}
              pcbX={1}
              pcbY={1}
              width={0.8}
              height={0.8}
              shape="rect"
              layer="top"
            />
          </footprint>
        }
      />
      <net name="OSC_IN" />
      <net name="OSC_OUT" />
      <net name="GND" />
      <trace from="X1.pin1" to="net.OSC_IN" />
      <trace from="X1.pin3" to="net.OSC_OUT" />
      <trace from="X1.pin2" to="net.GND" />
      <trace from="X1.pin4" to="net.GND" />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const sch = converter.getOutputString()

  // Find all pin definitions with name and number in the generated schematic
  const pinBlocks =
    sch.match(/\(pin passive line[\s\S]*?\(number "[^"]+"[\s\S]*?\)\s*\)/g) ??
    []
  expect(pinBlocks.length).toBeGreaterThanOrEqual(4)

  const pinMap = new Map<string, string>()
  for (const block of pinBlocks) {
    const nameMatch = block.match(/\(name "([^"]+)"/)
    const numMatch = block.match(/\(number "([^"]+)"/)
    if (nameMatch?.[1] && numMatch?.[1]) {
      pinMap.set(nameMatch[1], numMatch[1])
    }
  }

  // KiCad connects schematic symbol pins to footprint pads by NUMBER.
  // In issue #579, port order was:
  //   port 0: label "4" -> got number "1" (WRONG)
  //   port 1: label "2" -> got number "2"
  //   port 2: label "1" -> got number "3" (WRONG)
  //   port 3: label "3" -> got number "4" (WRONG)
  //
  // Every pin's number must match its physical circuit pin label:
  expect(pinMap.get("1")).toBe("1")
  expect(pinMap.get("2")).toBe("2")
  expect(pinMap.get("3")).toBe("3")
  expect(pinMap.get("4")).toBe("4")

  // Ensure the swapped mappings from the bug do not occur
  expect(pinMap.get("4")).not.toBe("1")
  expect(pinMap.get("1")).not.toBe("3")
})

test("repro579: chip symbols with explicit pin numbers preserve their pin numbers", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="30mm" height="30mm">
      <chip
        name="U1"
        pinLabels={{
          pin1: "VCC",
          pin2: "GND",
          pin3: "TX",
          pin4: "RX",
        }}
        pcbX={0}
        pcbY={0}
      />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const sch = converter.getOutputString()

  const pinBlocks =
    sch.match(/\(pin passive line[\s\S]*?\(number "[^"]+"[\s\S]*?\)\s*\)/g) ??
    []
  expect(pinBlocks.length).toBeGreaterThanOrEqual(4)

  const pinMap = new Map<string, string>()
  for (const block of pinBlocks) {
    const nameMatch = block.match(/\(name "([^"]+)"/)
    const numMatch = block.match(/\(number "([^"]+)"/)
    if (nameMatch?.[1] && numMatch?.[1]) {
      pinMap.set(nameMatch[1], numMatch[1])
    }
  }

  expect(pinMap.get("VCC")).toBe("1")
  expect(pinMap.get("GND")).toBe("2")
  expect(pinMap.get("TX")).toBe("3")
  expect(pinMap.get("RX")).toBe("4")
})

test("repro579: chip symbols with D0/D1 pin labels preserve explicit pin numbers", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="30mm" height="30mm">
      <chip
        name="U1"
        pinLabels={{
          pin1: "D0",
          pin2: "D1",
        }}
        pcbX={0}
        pcbY={0}
      />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const sch = converter.getOutputString()

  const pinBlocks =
    sch.match(/\(pin passive line[\s\S]*?\(number "[^"]+"[\s\S]*?\)\s*\)/g) ??
    []
  expect(pinBlocks.length).toBeGreaterThanOrEqual(2)

  const pinMap = new Map<string, string>()
  for (const block of pinBlocks) {
    const nameMatch = block.match(/\(name "([^"]+)"/)
    const numMatch = block.match(/\(number "([^"]+)"/)
    if (nameMatch?.[1] && numMatch?.[1]) {
      pinMap.set(nameMatch[1], numMatch[1])
    }
  }

  expect(pinMap.get("D0")).toBe("1")
  expect(pinMap.get("D1")).toBe("2")
})
