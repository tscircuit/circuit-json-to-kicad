# NEMA34 global copper-edge clearance regression

![Actual NEMA34 outline and GND route, zoomed at the reported violation](nema34-board-edge-clearance.png)

This is a reduced **real circuit** reproduction from
[techmannih/pd1180-epr at 952de54](https://github.com/techmannih/pd1180-epr/blob/952de54ca0b5dbe042d9ccc9a1a9ecf3e8f67779/release/circuit.json).
The complete input file has SHA-256
`674a23b77548a731e4e443ed10135bbcd1b8182ef0c262bd4549b1ac5782ffe3`.

`nema34-board-edge-clearance.circuit.json` contains these four records copied
verbatim (only JSON formatting changed):

- `pcb_board_0`: the actual 85.9 mm, four-layer board outline and its explicit
  `min_board_edge_clearance: 0.2`.
- `source_net_53`: GND.
- `source_trace_0`: the GND connectivity identity.
- `pcb_trace_cloud_routed_46`: the actual six-segment GND route near the edge.

No coordinates, widths or rule values were invented. Unrelated components and
routes are omitted; their referenced endpoint objects are not needed for this
edge-rule test. Dangling-track warnings in this isolated route are expected.

## Failure

The project converter did not serialize `pcb_board.min_board_edge_clearance` as
`board.design_settings.rules.min_copper_edge_clearance`. KiCad therefore used its
0.5 mm default instead of the circuit's explicit 0.2 mm global rule. The real GND
track at KiCad coordinates (131.75, 129.141699) has about 0.4453 mm clearance and
fails the unintended 0.5 mm constraint.

This global constraint is separate from the source GND pour's 0.5 mm
`boardEdgeMargin`. This repro contains no pour, and the fix changes no copper or
zone settings. It does not claim 0.2 mm is appropriate for every board.

## Run

Install the repository dependencies and KiCad 10, then run:

```sh
bun test tests/project/board-edge-clearance.test.ts
```

Set `KICAD_CLI` to the executable path when it is not on PATH. The test exports
the real outline and route, runs KiCad DRC with refill/all-track checks, and
compares two projects with byte-identical PCB content:

- With the global rule omitted (the old export behavior), KiCad reports
  `copper_edge_clearance` violations against 0.5000 mm.
- With the converter's project output, the explicit 0.2 mm rule is preserved and
  those edge violations are absent.

On KiCad 10.0.5, the reduced fixture produces four edge-clearance errors with the
rule omitted and zero with it preserved. The figure plots the fixture's actual
coordinates; it is a geometry illustration, not a KiCad GUI screenshot.

The two PCB/project files and complete DRC reports are saved to
`debug-output/nema34-board-edge-clearance/`. No DRC category is suppressed.
Additional tests cover explicit zero, another non-default value, an absent rule
and a schematic-only input. Before the fix, the real-board assertion fails
because `min_copper_edge_clearance` is absent.

The fixture can be independently reproduced by selecting the four IDs above
from the linked immutable Circuit JSON. This fix does not address the separately
reported zone-policy, duplicate-via or schematic-parity export issues.
