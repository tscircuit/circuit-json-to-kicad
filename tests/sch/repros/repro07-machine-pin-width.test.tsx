import { expect, test } from "bun:test"
import { Circuit } from "@tscircuit/core"
import { CircuitJsonToKicadSchConverter } from "lib"

const getSymbolBody = (kicad: string, symbolName: string) => {
  const marker = `(symbol \"${symbolName}\"`
  const start = kicad.indexOf(marker)
  if (start === -1) return null

  let depth = 0
  let end = start
  for (let i = start; i < kicad.length; i++) {
    const char = kicad[i]
    if (char === "(") depth++
    if (char === ")") depth--
    if (depth === 0) {
      end = i + 1
      break
    }
  }

  return kicad.slice(start, end)
}

test("repro07: MachinePin symbol width should remain 2mm in KiCad", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="20mm" height="20mm">
      <chip
        name="J1"
        footprint="soic8"
        symbol={
          <symbol name="MachinePin" width={2} height={0.4}>
            <schematicline
              x1={-1}
              y1={-0.2}
              x2={1}
              y2={-0.2}
              strokeWidth={0.05}
            />
            <schematicline
              x1={1}
              y1={-0.2}
              x2={1}
              y2={0.2}
              strokeWidth={0.05}
            />
            <schematicline
              x1={1}
              y1={0.2}
              x2={-1}
              y2={0.2}
              strokeWidth={0.05}
            />
            <schematicline
              x1={-1}
              y1={0.2}
              x2={-1}
              y2={-0.2}
              strokeWidth={0.05}
            />
            <port name="P1" direction="left" schX={-1} schY={0} />
            <port name="P2" direction="right" schX={1} schY={0} />
          </symbol>
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson() as any[]
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const kicadSch = converter.getOutputString()
  await Bun.write(
    "./debug-output/repro07-machine-pin-width.kicad_sch",
    kicadSch,
  )

  const symbolBody = getSymbolBody(kicadSch, "MachinePin_0_1")
  expect(symbolBody).toBeTruthy()

  const pointRegex = /\(xy\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\)/g
  const xs: number[] = []

  let match: RegExpExecArray | null
  while ((match = pointRegex.exec(symbolBody!)) !== null) {
    xs.push(Number(match[1]))
  }

  expect(xs.length).toBeGreaterThan(0)
  const width = Math.max(...xs) - Math.min(...xs)

  expect(width).toBeCloseTo(2, 3)
})
