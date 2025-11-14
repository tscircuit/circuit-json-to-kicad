import type { CircuitJsonUtilObjects } from "@tscircuit/circuit-json-util"
import type { CircuitJson } from "circuit-json"
import type { KicadSch, KicadPcb } from "kicadts"
import type { Matrix } from "transformation-matrix"
import type { PaperDimensions } from "./schematic/selectSchematicPaperSize"

// Type aliases for IDs to make context clearer
export type SchematicPortId = string
export type SchematicTraceId = string
export type PcbPortId = string
export type PcbTraceId = string

export interface PcbNetInfo {
  id: number
  name: string
}

export interface ConverterContext {
  db: CircuitJsonUtilObjects
  circuitJson: CircuitJson
  kicadSch?: KicadSch
  kicadPcb?: KicadPcb

  /** Circuit JSON to KiCad schematic transformation matrix */
  c2kMatSch?: Matrix

  /** Circuit JSON to KiCad PCB transformation matrix */
  c2kMatPcb?: Matrix

  /** Selected paper size for schematic */
  schematicPaperSize?: PaperDimensions

  // Optional data that can be shared between stages
  pinPositions?: Map<SchematicPortId, { x: number; y: number }>
  wireConnections?: Map<SchematicTraceId, SchematicPortId[]>

  // PCB-specific data
  pcbPadPositions?: Map<PcbPortId, { x: number; y: number }>
  pcbNetMap?: Map<string, PcbNetInfo> // Connectivity key to KiCad net metadata
}

export abstract class ConverterStage<Input, Output> {
  MAX_ITERATIONS = 1000
  iteration = 0

  finished = false

  input: Input
  ctx: ConverterContext

  constructor(input: Input, ctx: ConverterContext) {
    this.input = input
    this.ctx = ctx
  }

  step(): void {
    this.iteration++
    if (this.iteration > this.MAX_ITERATIONS) {
      throw new Error("Max iterations reached")
    }
    this._step()
  }

  _step(): void {
    throw new Error("Not implemented")
  }

  runUntilFinished(): void {
    while (!this.finished) {
      this.step()
    }
  }

  getOutput(): Output {
    throw new Error("Not implemented")
  }
}
