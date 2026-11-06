/**
 * Via tenting from Circuit JSON was dropped on PCB export, so every via fell
 * back to KiCad's board default. pcb_via tented_on_top / tented_on_bottom
 * (and the deprecated is_tented) must become a per-via
 * `(tenting (front ...) (back ...))` node, and a via with no tenting
 * information must keep emitting no tenting node at all.
 *
 * To run: bun test tests/pcb/repros/repro33-via-tenting.test.ts
 */
import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

const tentingCases: Array<[string, Record<string, boolean>, string | null]> = [
  [
    "both",
    { tented_on_top: true, tented_on_bottom: true },
    "(tenting (front yes) (back yes))",
  ],
  [
    "top_only",
    { tented_on_top: true, tented_on_bottom: false },
    "(tenting (front yes) (back no))",
  ],
  [
    "bottom_only",
    { tented_on_top: false, tented_on_bottom: true },
    "(tenting (front no) (back yes))",
  ],
  [
    "exposed",
    { tented_on_top: false, tented_on_bottom: false },
    "(tenting (front no) (back no))",
  ],
  ["unset", {}, null],
  ["legacy_tented", { is_tented: true }, "(tenting (front yes) (back yes))"],
  ["legacy_exposed", { is_tented: false }, "(tenting (front no) (back no))"],
  [
    "explicit_side_beats_legacy",
    { is_tented: true, tented_on_bottom: false },
    "(tenting (front yes) (back no))",
  ],
  [
    "top_side_only_set",
    { tented_on_top: true },
    "(tenting (front yes) (back none))",
  ],
]

test("repro33: via tenting is exported per via", () => {
  const circuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      center: { x: 0, y: 0 },
      width: 50,
      height: 20,
      thickness: 1.6,
      num_layers: 2,
      material: "fr4",
    },
    ...tentingCases.map(([name, tenting], i) => ({
      type: "pcb_via",
      pcb_via_id: `pcb_via_${name}`,
      x: -20 + i * 5,
      y: 0,
      outer_diameter: 0.8,
      hole_diameter: 0.4,
      layers: ["top", "bottom"],
      ...tenting,
    })),
    {
      type: "pcb_trace",
      pcb_trace_id: "pcb_trace_0",
      route: [
        { route_type: "wire", x: -20, y: 5, width: 0.2, layer: "top" },
        {
          route_type: "via",
          x: 0,
          y: 5,
          from_layer: "top",
          to_layer: "bottom",
          tented_on_top: false,
          tented_on_bottom: true,
        },
        { route_type: "wire", x: 20, y: 5, width: 0.2, layer: "bottom" },
      ],
    },
  ] as any

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  const vias = [
    ...output.matchAll(
      /\(via\b[\s\S]*?\(at ([-\d.]+) ([-\d.]+)\)[\s\S]*?\(uuid [^)]*\)/g,
    ),
  ]
  const tentingAt = new Map(
    vias.map((m) => [
      `${Number(m[1])},${Number(m[2])}`,
      m[0].match(/\(tenting[^\n]*\)/)?.[0] ?? null,
    ]),
  )

  // Circuit JSON (x, y) maps to KiCad (x + 100, 100 - y)
  tentingCases.forEach(([name, , expected], i) => {
    expect({ name, tenting: tentingAt.get(`${80 + i * 5},100`) }).toEqual({
      name,
      tenting: expected,
    })
  })

  // Vias defined on a trace route carry tenting too
  expect(tentingAt.get("100,95")).toBe("(tenting (front no) (back yes))")

  expect(vias.length).toBe(tentingCases.length + 1)
  expect(output.match(/\(tenting\b/g)?.length).toBe(tentingCases.length)
})
