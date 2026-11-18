import { beforeAll, expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadPcb } from "kicadts"
import sharp from "sharp"
import { CircuitJsonToKicadPcbConverter } from "../../../lib/pcb/CircuitJsonToKicadPcbConverter"
import { CircuitJsonToKicadSchConverter } from "../../../lib/schematic/CircuitJsonToKicadSchConverter"
import { createPadNameRoundTrip } from "../../fixtures/create-pad-name-round-trip"
import fixture from "../../fixtures/physical-bga-balls.circuit.json"

const ballNames = ["A1", "A2", "B1"]
let schematic: string
let ballPads: ReturnType<typeof parseKicadPcb>["footprints"][number]["fpPads"]

beforeAll(() => {
  const circuitJson = fixture.map((element) => {
    if (element.type !== "pcb_smtpad") return structuredClone(element)
    const pinIndex = Number(element.pcb_port_id?.split("_").at(-1))
    return { ...structuredClone(element), pad_number: ballNames[pinIndex] }
  }) as CircuitJson
  for (const element of circuitJson) {
    if (element.type === "source_port") {
      element.pin_number = ballNames.indexOf(element.name) + 1
    }
  }

  const pcb = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcb.runUntilFinished()
  ballPads = parseKicadPcb(pcb.getOutputString()).footprints[0]!.fpPads.filter(
    (pad) => pad.net,
  )
  const sch = new CircuitJsonToKicadSchConverter(circuitJson)
  sch.runUntilFinished()
  schematic = sch.getOutputString()
  expect(ballPads.map((pad) => pad.net?.name)).toEqual(["DATA", "GND", "GND"])
})

test("BGA pads keep their package names alongside numeric source pins", () => {
  expect(ballPads.map((pad) => pad.number)).toEqual(ballNames)
})

test("BGA schematic library pins keep the physical pad numbers", () => {
  for (const ball of ballNames) {
    expect(schematic).toContain(`(number "${ball}"`)
  }
})

test("BGA schematic instance pins keep the physical pad numbers", () => {
  for (const ball of ballNames) {
    expect(schematic).toContain(`(pin "${ball}"`)
  }
})

test("snapshot physical pad names in the source and serialized KiCad PCB", async () => {
  const rows = [
    { title: "BGA", expected: ballNames, exported: ballPads },
    ...(["smd", "thru_hole"] as const).map((padType) => {
      const { source, output } = createPadNameRoundTrip({
        padType,
        connected: false,
      })
      return {
        title:
          padType === "smd" ? "Unconnected SMT" : "Unconnected plated holes",
        expected: source.footprints[0]!.fpPads.map((pad) => pad.number),
        exported: output.footprints[0]!.fpPads,
      }
    }),
  ]

  // Draw a pad-number diagram from the serialized output. KiCad copper plots
  // omit pad numbers, so a plot of the copper alone would hide the regression.
  const panels = rows.map(({ title, expected, exported }, row) => {
    expect(exported).toHaveLength(expected.length)
    const pads = exported.map((pad, index) => {
      const x = 175 + 84 * index
      const color = pad.number === expected[index] ? "#1d604f" : "#a12b34"
      return `
        <text x="${x}" y="53" fill="#d3dde6">${expected[index]}</text>
        <rect x="${x - 32}" y="63" width="64" height="32" rx="7" fill="${color}"/>
        <text x="${x}" y="85" fill="white">${pad.number}</text>`
    })
    return `
      <g transform="translate(0 ${18 + row * 109})">
        <text x="20" y="20" font-weight="bold">${title}</text>
        <text x="20" y="53" fill="#d3dde6">Package ID</text>
        <text x="20" y="85">KiCad export</text>
        <g text-anchor="middle">${pads.join("")}</g>
      </g>`
  })
  const diagram = `<svg xmlns="http://www.w3.org/2000/svg" width="645" height="347">
    <rect width="645" height="347" fill="#192630"/>
    <g font-family="sans-serif" font-size="17" fill="white">${panels.join("")}</g>
  </svg>`
  const snapshot = await sharp(Buffer.from(diagram)).png().toBuffer()
  await expect(snapshot).toMatchPngSnapshot(import.meta.path)
})
