import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter";

test("panel export writes panel outline, all board outlines, and tab cutouts to Edge.Cuts (#813)", async () => {
  const circuit = new Circuit();
  const B = () => (
    <board width="14mm" height="18mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} />
      <capacitor name="C1" capacitance="100nF" footprint="0402" pcbX={2} />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
    </board>
  );

  circuit.add(
    <panel
      layoutMode="grid"
      row={3}
      col={3}
      boardGap="2mm"
      panelizationMethod="tab-routing"
      tabLength="3mm"
    >
      {Array.from({ length: 9 }, (_, i) => (
        <B key={i} />
      ))}
    </panel>,
  );

  await circuit.render();
  const circuitJson = circuit.getCircuitJson();

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson);
  converter.runUntilFinished();

  const pcb = converter.getOutput();
  const edgeCutsLines = (pcb.graphicLines || []).filter(
    (line: any) =>
      line.layer === "Edge.Cuts" || line.layer?.names?.[0] === "Edge.Cuts",
  );

  // 1 panel outline (4 lines) + 9 board outlines (36 lines) + 72 tab cutouts (288 lines) = 328 lines
  expect(edgeCutsLines.length).toBe(328);

  const outputString = converter.getOutputString();
  expect(outputString).toContain("(layer Edge.Cuts)");
});
