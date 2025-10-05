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

## Features

- **Schematic Conversion**: Convert Circuit JSON to KiCad schematic files (`.kicad_sch`)
  - Library symbols
  - Component placement
  - Wire routing
  - Net connections

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
