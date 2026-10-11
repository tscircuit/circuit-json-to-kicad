import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test.failing("an inner-layer route transition reuses its physical through via", async () => {
  const counts = []
  for (const [from, to] of [
    ["top", "inner1"],
    ["inner2", "bottom"],
  ]) {
    const circuitJson = [
      {
        type: "pcb_board",
        pcb_board_id: "board",
        center: { x: 0, y: 0 },
        width: 10,
        height: 8,
        thickness: 1.6,
        num_layers: 4,
        material: "fr4",
      },
      {
        type: "source_net",
        source_net_id: "gnd",
        name: "GND",
        subcircuit_connectivity_map_key: "gnd",
      },
      {
        type: "source_trace",
        source_trace_id: "source_trace",
        connected_source_port_ids: [],
        connected_source_net_ids: ["gnd"],
        subcircuit_connectivity_map_key: "gnd",
      },
      {
        type: "pcb_via",
        pcb_via_id: "via",
        pcb_trace_id: "trace",
        x: 1,
        y: 0,
        outer_diameter: 0.7,
        hole_diameter: 0.3,
        layers: ["top", "inner1", "inner2", "bottom"],
        from_layer: "top",
        to_layer: "bottom",
        subcircuit_connectivity_map_key: "gnd",
      },
      {
        type: "pcb_trace",
        pcb_trace_id: "trace",
        source_trace_id: "source_trace",
        subcircuit_connectivity_map_key: "gnd",
        route: [
          { route_type: "wire", x: 0, y: 0, layer: from, width: 0.2 },
          {
            route_type: "via",
            x: 1,
            y: 0,
            from_layer: from,
            to_layer: to,
            via_diameter: 0.7,
            via_hole_diameter: 0.3,
          },
          { route_type: "wire", x: 1, y: 0, layer: to, width: 0.2 },
          { route_type: "wire", x: 2, y: 0, layer: to, width: 0.2 },
        ],
      },
    ] as CircuitJson
    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()
    const vias = converter.getOutput().vias
    expect(
      vias.some(
        (via) =>
          via.layers?.names.includes("F.Cu") &&
          via.layers?.names.includes("B.Cu") &&
          via.size === 0.7 &&
          via.drill === 0.3,
      ),
    ).toBe(true)
    const uuids = new Set(vias.map((via) => via.uuid!.value))
    const escape = (text: string) =>
      text.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    const rows = vias
      .flatMap((via) => via.toString().split("\n"))
      .map(
        (row, index) =>
          `<text x="40" y="${130 + index * 20}">${escape(row)}</text>`,
      )
      .join("")
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/><g font-family="sans-serif" font-size="17" text-anchor="middle" fill="#222"><text x="400" y="30">The KiCad exporter converts Circuit JSON into PCB files.</text><text x="400" y="60">1 physical barrel / ${vias.length} exported vias, ${uuids.size} unique UUIDs. Expected 1 via.</text></g><g font-family="monospace" font-size="13" fill="#222">${rows}</g></svg>`
    if (process.env.EVIDENCE_DIR) {
      await Bun.write(`${process.env.EVIDENCE_DIR}/${from}-${to}.svg`, svg)
      await Bun.write(
        `${process.env.EVIDENCE_DIR}/${from}-${to}.kicad_pcb`,
        converter.getOutputString(),
      )
    }
    counts.push(vias.length)
  }
  expect(counts).toEqual([1, 1])
})
