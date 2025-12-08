import type { CircuitJson } from "circuit-json"
import { circuitJsonToStep } from "circuit-json-to-step"

export interface CircuitJsonToKicadStepOptions {
  /** Board width in mm (optional if pcb_board is present) */
  boardWidth?: number
  /** Board height in mm (optional if pcb_board is present) */
  boardHeight?: number
  /** Board thickness in mm (default: 1.6mm or from pcb_board) */
  boardThickness?: number
  /** Product name for the STEP file (default: "PCB") */
  productName?: string
  /** Include component 3D models (default: true) */
  includeComponents?: boolean
  /** Include external 3D models from model_*_url fields (default: true) */
  includeExternalMeshes?: boolean
}

/**
 * Converts Circuit JSON to STEP format for 3D CAD integration.
 *
 * This converter generates a STEP file that includes:
 * - The PCB board with proper dimensions and holes
 * - Component 3D models (if includeComponents is true)
 * - External STEP models referenced via cad_component.model_step_url
 *
 * @example
 * ```typescript
 * import { CircuitJsonToKicadStepConverter } from "circuit-json-to-kicad"
 *
 * const converter = new CircuitJsonToKicadStepConverter(circuitJson, {
 *   productName: "MyPCB",
 *   includeComponents: true,
 * })
 *
 * await converter.convert()
 * const stepContent = converter.getOutputString()
 *
 * // Write to file
 * Bun.write("output.step", stepContent)
 * ```
 */
export class CircuitJsonToKicadStepConverter {
  private circuitJson: CircuitJson
  private options: CircuitJsonToKicadStepOptions
  private output: string | null = null
  private finished = false

  constructor(
    circuitJson: CircuitJson,
    options: CircuitJsonToKicadStepOptions = {},
  ) {
    this.circuitJson = circuitJson
    this.options = {
      includeComponents: true,
      includeExternalMeshes: true,
      ...options,
    }
  }

  /**
   * Convert the circuit JSON to STEP format.
   * This is an async operation because it may need to fetch external 3D models.
   */
  async convert(): Promise<void> {
    this.output = await circuitJsonToStep(this.circuitJson, {
      boardWidth: this.options.boardWidth,
      boardHeight: this.options.boardHeight,
      boardThickness: this.options.boardThickness,
      productName: this.options.productName,
      includeComponents: this.options.includeComponents,
      includeExternalMeshes: this.options.includeExternalMeshes,
    })
    this.finished = true
  }

  /**
   * Check if the conversion is finished
   */
  get isFinished(): boolean {
    return this.finished
  }

  /**
   * Get the STEP output as a string.
   * Must call convert() first.
   */
  getOutputString(): string {
    if (this.output === null) {
      throw new Error("Conversion not complete. Call convert() first.")
    }
    return this.output
  }

  /**
   * Get the STEP output as a string.
   * Must call convert() first.
   */
  getOutput(): string {
    return this.getOutputString()
  }
}
