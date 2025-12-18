import type { CircuitJson } from "circuit-json"
import { cju } from "@tscircuit/circuit-json-util"
import {
  parseKicadSexpr,
  KicadSch,
  KicadPcb,
  Footprint,
  FootprintModel,
  At,
  SchematicSymbol,
} from "kicadts"
import { CircuitJsonToKicadSchConverter } from "../schematic/CircuitJsonToKicadSchConverter"
import { CircuitJsonToKicadPcbConverter } from "../pcb/CircuitJsonToKicadPcbConverter"
import path from "node:path"

const KICAD_SYM_LIB_VERSION = 20211014
const GENERATOR = "circuit-json-to-kicad"

interface CircuitJsonToKicadLibraryOptions {
  libraryName?: string
  footprintLibraryName?: string
}

export interface SymbolEntry {
  symbolName: string
  content: string
}

export interface FootprintEntry {
  footprintName: string
  content: string
  modelFiles: string[]
}

export interface KicadLibraryOutput {
  symbolLibrary: string
  footprints: FootprintEntry[]
  fpLibTable: string
  symLibTable: string
  modelFiles: string[]
}

export class CircuitJsonToKicadLibraryConverter {
  private ctx: {
    db: ReturnType<typeof cju>
    circuitJson: CircuitJson
  }

  private libraryName: string
  private fpLibraryName: string
  private output: KicadLibraryOutput | null = null

  constructor(
    circuitJson: CircuitJson,
    options: CircuitJsonToKicadLibraryOptions = {},
  ) {
    this.ctx = {
      db: cju(circuitJson),
      circuitJson,
    }
    this.libraryName = options.libraryName ?? "tscircuit"
    this.fpLibraryName = options.footprintLibraryName ?? "tscircuit"
  }

  runUntilFinished(): void {
    // Generate schematic to extract symbols
    const schConverter = new CircuitJsonToKicadSchConverter(
      this.ctx.circuitJson,
    )
    schConverter.runUntilFinished()
    const schContent = schConverter.getOutputString()

    // Generate PCB to extract footprints
    const pcbConverter = new CircuitJsonToKicadPcbConverter(
      this.ctx.circuitJson,
    )
    pcbConverter.runUntilFinished()
    const pcbContent = pcbConverter.getOutputString()

    // Extract symbols and footprints
    const symbolEntries = this.extractSymbolsFromSchematic(schContent)
    const footprintEntries = this.extractFootprintsFromPcb(pcbContent)

    // Collect all model files
    const modelFiles = new Set<string>()
    for (const fp of footprintEntries) {
      for (const modelFile of fp.modelFiles) {
        modelFiles.add(modelFile)
      }
    }

    // Generate symbol library
    const symbolLibrary = this.generateSymbolLibrary(symbolEntries)

    // Generate library tables
    const fpLibTable = this.generateFpLibTable()
    const symLibTable = this.generateSymLibTable()

    this.output = {
      symbolLibrary,
      footprints: footprintEntries,
      fpLibTable,
      symLibTable,
      modelFiles: Array.from(modelFiles),
    }
  }

  private extractSymbolsFromSchematic(schContent: string): SymbolEntry[] {
    const uniqueSymbols = new Map<string, SymbolEntry>()

    try {
      const parsed = parseKicadSexpr(schContent)
      const sch = parsed.find(
        (node): node is KicadSch => node instanceof KicadSch,
      )
      if (!sch) return []

      const libSymbols = sch.libSymbols
      if (!libSymbols) return []

      const symbols = libSymbols.symbols ?? []
      for (const symbol of symbols) {
        const symbolName = this.sanitizeSymbolName(symbol.libraryId)
        if (!uniqueSymbols.has(symbolName)) {
          // Update libraryId for standalone library use
          symbol.libraryId = symbolName
          uniqueSymbols.set(symbolName, {
            symbolName,
            content: symbol.getString(),
          })
        }
      }
    } catch (error) {
      console.warn("Failed to parse schematic for symbol extraction:", error)
    }

    return Array.from(uniqueSymbols.values())
  }

  private sanitizeSymbolName(libraryId?: string): string {
    if (!libraryId) return "symbol"
    // Remove library prefix if present (e.g., "Device:R" -> "R")
    const parts = libraryId.split(":")
    const name = parts.length > 1 ? parts[1] : parts[0]
    return name?.replace(/[\\\/]/g, "-").trim() || "symbol"
  }

  private extractFootprintsFromPcb(pcbContent: string): FootprintEntry[] {
    const uniqueFootprints = new Map<string, FootprintEntry>()

    try {
      const parsed = parseKicadSexpr(pcbContent)
      const pcb = parsed.find(
        (node): node is KicadPcb => node instanceof KicadPcb,
      )
      if (!pcb) return []

      const footprints = pcb.footprints ?? []
      for (const footprint of footprints) {
        const sanitized = this.sanitizeFootprint(footprint)
        if (!uniqueFootprints.has(sanitized.footprintName)) {
          uniqueFootprints.set(sanitized.footprintName, sanitized)
        }
      }
    } catch (error) {
      console.warn("Failed to parse PCB for footprint extraction:", error)
    }

    return Array.from(uniqueFootprints.values())
  }

  private sanitizeFootprint(footprint: Footprint): FootprintEntry {
    // Extract footprint name from libraryLink (e.g., "tscircuit:simple_resistor" -> "simple_resistor")
    const libraryLink = footprint.libraryLink ?? "footprint"
    const parts = libraryLink.split(":")
    const footprintName =
      (parts.length > 1 ? parts[1] : parts[0])
        ?.replace(/[\\\/]/g, "-")
        .trim() || "footprint"

    // Reset footprint for library use
    footprint.libraryLink = footprintName
    footprint.position = At.from([0, 0, 0])
    footprint.locked = false
    footprint.placed = false
    footprint.uuid = undefined
    footprint.path = undefined
    footprint.sheetfile = undefined
    footprint.sheetname = undefined
    footprint.properties = []

    // Clean up texts
    const texts = footprint.fpTexts ?? []
    for (const text of texts) {
      text.uuid = undefined
      if (text.type === "reference") {
        text.text = "REF**"
      } else if (text.type === "value" && text.text.trim().length === 0) {
        text.text = footprintName
      }
    }
    footprint.fpTexts = texts

    // Clean up pads
    const pads = footprint.fpPads ?? []
    for (const pad of pads) {
      pad.uuid = undefined
      pad.net = undefined
    }
    footprint.fpPads = pads

    // Handle 3D models - update paths and collect original files
    const models = footprint.models ?? []
    const updatedModels: FootprintModel[] = []
    const modelFiles: string[] = []

    for (const model of models) {
      if (model.path) {
        const modelFilename = path.basename(model.path)
        const newPath = `\${KIPRJMOD}/${this.fpLibraryName}.3dshapes/${modelFilename}`

        const newModel = new FootprintModel(newPath)
        if (model.offset) newModel.offset = model.offset
        if (model.scale) newModel.scale = model.scale
        if (model.rotate) newModel.rotate = model.rotate

        updatedModels.push(newModel)
        modelFiles.push(model.path)
      }
    }
    footprint.models = updatedModels

    return {
      footprintName,
      content: footprint.getString(),
      modelFiles,
    }
  }

  private generateSymbolLibrary(symbols: SymbolEntry[]): string {
    const lines: string[] = []

    lines.push("(kicad_symbol_lib")
    lines.push(`\t(version ${KICAD_SYM_LIB_VERSION})`)
    lines.push(`\t(generator "${GENERATOR}")`)

    for (const symbol of symbols) {
      const symbolLines = symbol.content.split("\n")
      for (const line of symbolLines) {
        lines.push(`\t${line}`)
      }
    }

    lines.push(")")

    return lines.join("\n")
  }

  private generateFpLibTable(): string {
    return `(fp_lib_table
  (version 7)
  (lib (name "${this.fpLibraryName}") (type "KiCad") (uri "\${KIPRJMOD}/${this.fpLibraryName}.pretty") (options "") (descr "Generated by circuit-json-to-kicad"))
)
`
  }

  private generateSymLibTable(): string {
    return `(sym_lib_table
  (version 7)
  (lib (name "${this.libraryName}") (type "KiCad") (uri "\${KIPRJMOD}/${this.libraryName}.kicad_sym") (options "") (descr "Generated by circuit-json-to-kicad"))
)
`
  }

  getOutput(): KicadLibraryOutput {
    if (!this.output) {
      throw new Error("Converter has not been run yet")
    }
    return this.output
  }

  getSymbolLibraryString(): string {
    return this.getOutput().symbolLibrary
  }

  getFootprints(): FootprintEntry[] {
    return this.getOutput().footprints
  }

  getFpLibTableString(): string {
    return this.getOutput().fpLibTable
  }

  getSymLibTableString(): string {
    return this.getOutput().symLibTable
  }

  getModelFiles(): string[] {
    return this.getOutput().modelFiles
  }
}
