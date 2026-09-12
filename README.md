# circuit-json-to-kicad

Convert [Circuit JSON](https://github.com/tscircuit/circuit-json) files to KiCad schematic (`.kicad_sch`), PCB (`.kicad_pcb`), and project (`.kicad_pro`) files.

Circuit JSON is an open-source file format for describing electronic circuits. This library enables you to generate KiCad-compatible files from Circuit JSON, allowing you to use KiCad's powerful PCB design tools with circuits defined in code.

## Installation

```bash
npm install circuit-json-to-kicad
# or
bun add circuit-json-to-kicad
```

## Usage

### Converting to KiCad Schematic

```typescript
import { CircuitJsonToKicadSchConverter } from "circuit-json-to-kicad"

// Assuming you have circuit JSON from tscircuit or another source
const circuitJson = /* your circuit JSON */

const converter = new CircuitJsonToKicadSchConverter(circuitJson)
converter.runUntilFinished()

// Get the KiCad schematic file content
const kicadSchContent = converter.getOutputString()

// Write to file
Bun.write("output.kicad_sch", kicadSchContent)
```

### Converting to KiCad PCB

```typescript
import { CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad"

const circuitJson = /* your circuit JSON */

const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
converter.runUntilFinished()

// Get the KiCad PCB file content
const kicadPcbContent = converter.getOutputString()

// Write to file
Bun.write("output.kicad_pcb", kicadPcbContent)
```

### Generating a KiCad Project

```typescript
import { CircuitJsonToKicadProConverter } from "circuit-json-to-kicad"

const circuitJson = /* your circuit JSON */

const converter = new CircuitJsonToKicadProConverter(circuitJson, {
  projectName: "my_project",
  schematicFilename: "my_project.kicad_sch",
  pcbFilename: "my_project.kicad_pcb",
})

converter.runUntilFinished()

const kicadProjectContent = converter.getOutputString()

Bun.write("my_project.kicad_pro", kicadProjectContent)
```

### Complete Example with tscircuit

```typescript
import { Circuit } from "tscircuit"
import {
  CircuitJsonToKicadSchConverter,
  CircuitJsonToKicadPcbConverter,
} from "circuit-json-to-kicad"

// Define your circuit
const circuit = new Circuit()
circuit.add(
  <board width="10mm" height="10mm">
    <resistor name="R1" resistance="1k" footprint="0402" />
    <capacitor
      name="C1"
      capacitance="1uF"
      footprint="0603"
      connections={{ pin1: "R1.pin2" }}
    />
  </board>,
)

await circuit.renderUntilSettled()

// Get Circuit JSON
const circuitJson = circuit.getCircuitJson()

// Convert to KiCad schematic
const schConverter = new CircuitJsonToKicadSchConverter(circuitJson)
schConverter.runUntilFinished()
Bun.write("output.kicad_sch", schConverter.getOutputString())

// Convert to KiCad PCB
const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
pcbConverter.runUntilFinished()
Bun.write("output.kicad_pcb", pcbConverter.getOutputString())
```

### Hierarchical Schematic Sheets

If your circuit declares tscircuit `<schematicsheet />` elements and assigns
components to them with the `schSheetName` prop, the converter emits a **KiCad
hierarchical schematic**: a root `.kicad_sch` containing one `(sheet)` node per
sheet, plus a separate child `.kicad_sch` file for each sheet's contents.

```tsx
circuit.add(
  <board>
    <schematicsheet name="Power" displayName="Power" sheetIndex={0} />
    <schematicsheet name="Logic" displayName="Logic" sheetIndex={1} />

    <resistor name="R1" resistance="10k" footprint="0402" schSheetName="Power" />
    <chip name="U1" footprint="soic8" schSheetName="Logic" />
  </board>,
)
await circuit.renderUntilSettled()

const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
converter.runUntilFinished()

// Root schematic + one child .kicad_sch per sheet.
for (const { filename, content } of converter.getOutputFiles({
  schematicFilename: "my_project.kicad_sch",
})) {
  Bun.write(filename, content)
}
```

Notes:

- `getOutputString()` returns the **root** file; `getOutputFiles()` returns the
  root file followed by one child file per sheet (named after the sheet). Write
  them side by side so KiCad can resolve each `Sheetfile` reference.
- A design with **no** `<schematicsheet>` produces a single flat file exactly as
  before.
- Nets shared across sheets (same-named net labels) become KiCad labels that
  connect by name across the whole hierarchy, so no hierarchical sheet pins are
  required.

## Features

- **Schematic Conversion**: Convert Circuit JSON to KiCad schematic files (`.kicad_sch`)
  - Library symbols
  - Component placement
  - Wire routing
  - Net connections
  - Hierarchical schematic sheets (multi-file `<schematicsheet>` export)

- **PCB Conversion**: Convert Circuit JSON to KiCad PCB files (`.kicad_pcb`)
  - Footprint placement
  - Trace routing
  - Vias
  - Board outlines and graphics
  - Net assignments
- **Project Generation**: Produce KiCad project files (`.kicad_pro`) that reference the generated schematic and PCB outputs

## Development

This project uses [Bun](https://bun.sh) as its runtime and package manager.

### Prerequisites

- Bun (latest version)
- KiCad (for testing generated files)

### Setup

```bash
# Install dependencies
bun install

# Download KiCad demo files (used for reference)
bun run download-demos

# Run tests
bun test
```

### Testing

Tests generate visual PNG snapshots for comparison:

```bash
# Run a specific test
bun test tests/sch/basics/basics01.test.tsx

# Run all tests
bun test

# Update snapshots (if needed)
BUN_UPDATE_SNAPSHOTS=1 bun test
```

Generated debug output is saved to the `debug-output/` directory.

### Project Structure

```
lib/
├── index.ts                           # Main exports
├── types.ts                           # Shared types
├── schematic/
│   ├── CircuitJsonToKicadSchConverter.ts  # Schematic converter
│   └── stages/                        # Conversion pipeline stages
└── pcb/
    ├── CircuitJsonToKicadPcbConverter.ts  # PCB converter
    └── stages/                        # Conversion pipeline stages
```

## About Circuit JSON

Circuit JSON is an open-source file format for representing electronic circuits. Learn more:

- [Circuit JSON on npm](https://www.npmjs.com/package/circuit-json)
- [Circuit JSON README](https://github.com/tscircuit/circuit-json)
- [tscircuit](https://github.com/tscircuit/tscircuit) - Create circuits using React/TSX

## License

MIT License - see [LICENSE](./LICENSE) for details.

Some interoperability test artifacts are generated from assets by KiCad. See [KiCad licenses](https://www.kicad.org/about/licenses/) for more information.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

### Text font substitution

Exported labels remain editable native KiCad text. KiCad's built-in
stroke font differs from the Arial/sans-serif font used by the SVG preview;
exporting the same numeric size on both axes does not preserve the text width.

The exporter preserves the requested native text height and fits the horizontal
size to a `0.6 * font_size` allocation per character on the longest line. It
uses measured KiCad 10 stroke-font advances, including the text box's stroke
margins, and never stretches a label wider than its original native size. The
stroke is capped at 0.10 mm, scales down with small text, and respects KiCad's
limit of one quarter of the smaller size axis. A shared helper applies this policy to standalone and footprint silkscreen,
fabrication notes, PCB notes, schematic text (including symbol primitives), net
labels, pins, sheet titles and generated reference/value/property text. Existing
schematic scaling and default-height policies still determine the native height.
Explicit KiCad font metadata bypasses the fitting step and retains its native
size and thickness. Imported native symbols keep their own font settings.

This covers the supported text conversion paths; it does not add exporters for
the currently unsupported `pcb_copper_text` or legacy `pcb_text` records.

This is a fit to the source's width estimate, not preservation of the SVG glyph
outlines or exact Arial metrics. Short lines, multiline spacing, native markup, text variables
expanded inside KiCad, and native font shapes can still differ from the preview.
Keep checking native DRC for fabrication clearances. No text-height rules are
lowered and no DRC warnings are suppressed.

The numeric advance table is bundled so conversion works without a KiCad
installation. To regenerate it, run `scripts/measure-kicad-stroke-font.py` with
KiCad 10's Python (`pcbnew` must be importable). The native regression tests in
`tests/pcb/silkscreen-text-metrics.test.ts` require `kicad-cli` and verify both
board-edge clipping and adjacent-label overlap against the old settings.
