import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"

/**
 * KiCad joins a symbol's pins to its footprint pads BY NUMBER, so the number on each symbol pin
 * must be the pin_number of the circuit port drawn at that pin. It must not come from the symbol's
 * port order or its labels: those describe the symbol's convention, not the circuit's.
 * See https://github.com/tscircuit/circuit-json-to-kicad/issues/579
 */

type Pin = { x: number; y: number; number: string }

/** Every pin of the library symbol named `libName`, with its position and number. */
function libPins(kicadSch: string, libName: string): Pin[] {
  const start = kicadSch.indexOf(`(symbol "${libName}"`)
  expect(start).toBeGreaterThanOrEqual(0)
  let depth = 0
  let end = start
  for (let i = start; i < kicadSch.length; i++) {
    if (kicadSch[i] === "(") depth++
    else if (kicadSch[i] === ")" && --depth === 0) {
      end = i
      break
    }
  }
  const block = kicadSch.slice(start, end)
  const pins: Pin[] = []
  const re =
    /\(pin \w+ \w+\s*\(at ([-\d.]+) ([-\d.]+) \d+\)[\s\S]*?\(number "([^"]*)"/g
  for (const m of block.matchAll(re))
    pins.push({ x: Number(m[1]), y: Number(m[2]), number: m[3] ?? "" })
  return pins
}

/**
 * For each circuit port of `componentName`, the number on the symbol pin drawn in the same
 * direction from the symbol's centre, keyed by the circuit port's pin_number.
 */
function numberAtEachCircuitPort(
  circuitJson: any[],
  libName: string,
  componentName: string,
) {
  const converter = new CircuitJsonToKicadSchConverter(circuitJson as any)
  converter.runUntilFinished()
  const pins = libPins(converter.getOutputString(), libName)
  const src = circuitJson.find(
    (e) => e.type === "source_component" && e.name === componentName,
  )
  const sch = circuitJson.find(
    (e) =>
      e.type === "schematic_component" &&
      e.source_component_id === src.source_component_id,
  )
  const ports = circuitJson.filter(
    (e) =>
      e.type === "schematic_port" &&
      e.schematic_component_id === sch.schematic_component_id,
  )
  const out: Record<string, string> = {}
  for (const port of ports) {
    const a = Math.atan2(
      port.center.y - sch.center.y,
      port.center.x - sch.center.x,
    )
    const pin = pins.reduce(
      (best, p) => {
        const d = Math.abs(
          Math.atan2(
            Math.sin(Math.atan2(p.y, p.x) - a),
            Math.cos(Math.atan2(p.y, p.x) - a),
          ),
        )
        return !best || d < best.d ? { d, p } : best
      },
      null as null | { d: number; p: Pin },
    )!.p
    out[String(port.pin_number)] = pin.number
  }
  return out
}

function render(jsx: any) {
  const circuit = new Circuit()
  circuit.add(jsx)
  circuit.render()
  return circuit.getCircuitJson() as any[]
}

/** The two ports of a 2-pin part trade places, as newer core draws a pin1=cathode LED. */
function swapTwoPorts(circuitJson: any[], componentName: string) {
  const src = circuitJson.find(
    (e) => e.type === "source_component" && e.name === componentName,
  )
  const sch = circuitJson.find(
    (e) =>
      e.type === "schematic_component" &&
      e.source_component_id === src.source_component_id,
  )
  const ports = circuitJson.filter(
    (e) =>
      e.type === "schematic_port" &&
      e.schematic_component_id === sch.schematic_component_id,
  )
  expect(ports.length).toBe(2)
  ;[ports[0].center, ports[1].center] = [ports[1].center, ports[0].center]
  return circuitJson
}

test("pin numbers: four-pin crystal pads keep their own numbers", () => {
  const cj = render(
    <board width="20mm" height="20mm">
      <crystal
        name="X1"
        frequency="8MHz"
        loadCapacitance="20pF"
        pinVariant="four_pin"
        footprint="hc49"
      />
    </board>,
  )
  const sym = cj.find((e) => e.type === "schematic_component").symbol_name
  const n = numberAtEachCircuitPort(cj, `Device:${sym}`, "X1")
  expect(n).toEqual({ "1": "1", "2": "2", "3": "3", "4": "4" })
})

test("pin numbers: polarized capacitor keeps pin 1 (positive) on pin 1", () => {
  // The repro from #579: C1.pin1 goes to V24, and the schematic must agree with the PCB.
  const cj = render(
    <board width="20mm" height="20mm">
      <capacitor
        name="C1"
        polarized
        capacitance="220uF"
        footprint="electrolytic_d10mm_p5mm"
        pcbX={0}
        pcbY={0}
      />
      <capacitor
        name="C2"
        capacitance="100nF"
        footprint="0603"
        pcbX={8}
        pcbY={0}
      />
      <trace from=".C1 > .pin1" to="net.V24" />
      <trace from=".C1 > .pin2" to="net.GND" />
      <trace from=".C2 > .pin1" to="net.V24" />
      <trace from=".C2 > .pin2" to="net.GND" />
    </board>,
  )
  const sch = cj.find(
    (e) =>
      e.type === "schematic_component" &&
      e.symbol_name?.startsWith("capacitor_polarized"),
  )
  const n = numberAtEachCircuitPort(cj, `Device:${sch.symbol_name}`, "C1")
  expect(n).toEqual({ "1": "1", "2": "2" })
})

test("pin numbers: an LED drawn the other way round from its symbol keeps each pin's own number", () => {
  // The real trigger: a board that labels an LED's pin 1 as the cathode (core's default is pin 1 =
  // anode). Core matches circuit ports to symbol ports by label, so with newer core and
  // schematic-symbols that cathode is drawn on the symbol port labelled "2", and reading the number
  // off the symbol reverses the LED in KiCad. The pinned test dependencies here predate both that
  // symbol layout and <led pinLabels>, so the two ports are swapped explicitly to reproduce the
  // drawing. What is asserted is the invariant: each pin carries its own circuit port's number.
  const led = (
    <board width="20mm" height="20mm">
      <led name="D1" color="red" footprint="0603" />
    </board>
  )
  const asBuilt = render(led)
  const sym = asBuilt.find((e) => e.type === "schematic_component").symbol_name
  expect(numberAtEachCircuitPort(asBuilt, `Device:${sym}`, "D1")).toEqual({
    "1": "1",
    "2": "2",
  })
  const swapped = swapTwoPorts(render(led), "D1")
  expect(numberAtEachCircuitPort(swapped, `Device:${sym}`, "D1")).toEqual({
    "1": "1",
    "2": "2",
  })
})

test("pin numbers: two instances of one library symbol that need different numbering fail loudly", () => {
  // Both LEDs share one library symbol (same lib id), but D2's ports are drawn the other way
  // round, so no single definition can number both correctly. Refuse rather than let D1 win.
  const cj = render(
    <board width="20mm" height="20mm">
      <led name="D1" color="red" footprint="0603" pcbX={-3} />
      <led name="D2" color="red" footprint="0603" pcbX={3} />
    </board>,
  )
  swapTwoPorts(cj, "D2")
  const converter = new CircuitJsonToKicadSchConverter(cj as any)
  expect(() => converter.runUntilFinished()).toThrow(
    /instances disagree on pin numbering/,
  )
})
