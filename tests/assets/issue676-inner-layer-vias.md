# Issue #676: duplicate vias on a four-layer board

`issue676-inner-layer-vias.json` is the complete, unmodified Circuit JSON
generated from the example in [#676](https://github.com/tscircuit/circuit-json-to-kicad/issues/676),
using **tscircuit 0.0.2942** and Bun 1.3.14. Only JSON whitespace was formatted.
The test consumes the captured JSON rather than rerunning the autorouter or
changing the repository's existing tscircuit dependencies.

## Generate the input

In a separate scratch directory, run `bun add --exact tscircuit@0.0.2942`, save
the following as `generate.tsx`, and run `bun run generate.tsx`:

```tsx
import { Circuit } from "tscircuit"

const circuit = new Circuit()
circuit.add(
  <board width="24mm" height="16mm" layers={4} routeRemaining>
    <copperpour connectsTo="net.GND" layer="inner1" clearance="0.3mm" boardEdgeMargin="0.5mm" />
    <resistor name="R1" resistance="1k" footprint="0603" pcbX={-6} pcbY={4} connections={{ pin2: "net.GND" }} />
    <resistor name="R2" resistance="1k" footprint="0603" pcbX={6} pcbY={4} connections={{ pin1: "net.GND" }} />
    <resistor name="R3" resistance="1k" footprint="0603" pcbX={-6} pcbY={-4} connections={{ pin2: "net.GND" }} />
    <resistor name="R4" resistance="1k" footprint="0603" pcbX={6} pcbY={-4} connections={{ pin1: "net.GND" }} />
    <trace name="A" from=".R1 > .pin1" to=".R4 > .pin2" />
    <trace name="B" from=".R2 > .pin2" to=".R3 > .pin1" />
  </board>,
)
await circuit.renderUntilSettled()
await Bun.write("circuit.json", JSON.stringify(circuit.getCircuitJson(), null, 2))
```

## Reproduce the exporter failure

Run `bun test tests/pcb/repros/issue676-inner-layer-vias.test.ts`.
The desired-behavior assertion is marked `test.failing` so this reproduction
can be merged without making CI fail. Remove `.failing` to see **expected 6,
received 10** on upstream main at `2b4d81ed0bc4a8336fd3a41d510ec9e9834196b4`.
Convert it to a normal test when the bug is fixed.

The input has six physical `pcb_via` records and six matching `pcb_trace.route`
via points, paired by trace ID and position. All physical records enumerate
`top`, `inner1`, `inner2`, `bottom`; four transitions connect top and inner1
(in either direction), and two connect top and bottom.

The serialized `.kicad_pcb` contains ten `(via ...)` entries at six positions:

| Input position (mm) | Physical span | Additional route span |
| --- | --- | --- |
| (-5.047, -1.3) | F.Cu / B.Cu | F.Cu / In1.Cu |
| (-5.047, -2.5) | F.Cu / B.Cu | F.Cu / In1.Cu |
| (5.4, 3.154) | F.Cu / B.Cu | none |
| (5, -3.2) | F.Cu / B.Cu | none |
| (-5.849338894803194, 3.051172001745289) | F.Cu / B.Cu | F.Cu / In1.Cu |
| (6, -3) | F.Cu / B.Cu | F.Cu / In1.Cu |

`AddViasStage.collectPcbVias` collects both representations. Its dedupe key
includes the normalized layer span, so a physical F.Cu/B.Cu via and its
F.Cu/In1.Cu route transition have different keys and both survive. The top/bottom
transitions already dedupe correctly. The two control exports (physical records
only and route records only) each contain six vias and preserve dimensions
and nonzero net assignments.

This reproduces the duplicate exported records. Native KiCad DRC was not run
for this reproduction; it does not assert the `holes_co_located` diagnostic.
It also leaves the choice of physical span versus transition span to the fix.

Related existing work: [#629](https://github.com/tscircuit/circuit-json-to-kicad/pull/629),
[#631](https://github.com/tscircuit/circuit-json-to-kicad/pull/631), and
[#632](https://github.com/tscircuit/circuit-json-to-kicad/pull/632).
This fixture records the specific copper-pour / `routeRemaining` example in
#676, including its six-to-ten via count and legacy route diameter aliases.
