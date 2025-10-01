import type { CircuitJson } from "circuit-json"
import type { KicadPcb } from "kicadts"
import {
  Paper,
  PcbLayers,
  PcbLayerDefinition,
  PcbGeneral,
  Setup,
} from "kicadts"
import { ConverterStage, type ConverterContext } from "../../types"

/**
 * Initializes the basic KicadPcb structure with version, paper size, layers, UUID, etc.
 */
export class InitializePcbStage extends ConverterStage<CircuitJson, KicadPcb> {
  override _step(): void {
    const { kicadPcb } = this.ctx

    if (!kicadPcb) {
      throw new Error("KicadPcb instance not initialized in context")
    }

    // Set the version to KiCad 9.0 format
    kicadPcb.version = 20241229

    // Set paper size to A4 (standard)
    const paper = new Paper()
    paper.size = "A4"
    kicadPcb.paper = paper

    // Add general section with board thickness
    const general = new PcbGeneral()
    general.thickness = 1.6 // Standard PCB thickness in mm
    kicadPcb.general = general

    // Add setup section with basic design rules
    const setup = new Setup()
    setup.padToMaskClearance = 0.0
    kicadPcb.setup = setup

    // Initialize standard PCB layers
    const layers = new PcbLayers()

    const layerDefinitions = [
      // Copper layers (standard KiCad indices)
      new PcbLayerDefinition({ index: 0, name: "F.Cu", type: "signal" }),
      new PcbLayerDefinition({ index: 2, name: "B.Cu", type: "signal" }),
      // Technical layers
      new PcbLayerDefinition({ index: 9, name: "F.Adhes", type: "user" }),
      new PcbLayerDefinition({ index: 11, name: "B.Adhes", type: "user" }),
      new PcbLayerDefinition({ index: 13, name: "F.Paste", type: "user" }),
      new PcbLayerDefinition({ index: 15, name: "B.Paste", type: "user" }),
      new PcbLayerDefinition({ index: 5, name: "F.SilkS", type: "user" }),
      new PcbLayerDefinition({ index: 7, name: "B.SilkS", type: "user" }),
      new PcbLayerDefinition({ index: 1, name: "F.Mask", type: "user" }),
      new PcbLayerDefinition({ index: 3, name: "B.Mask", type: "user" }),
      // Drawing layers
      new PcbLayerDefinition({ index: 20, name: "Dwgs.User", type: "user" }),
      new PcbLayerDefinition({ index: 21, name: "Cmts.User", type: "user" }),
      new PcbLayerDefinition({ index: 22, name: "Eco1.User", type: "user" }),
      new PcbLayerDefinition({ index: 23, name: "Eco2.User", type: "user" }),
      new PcbLayerDefinition({ index: 24, name: "Edge.Cuts", type: "user" }),
      new PcbLayerDefinition({ index: 25, name: "Margin", type: "user" }),
      // Fabrication layers
      new PcbLayerDefinition({ index: 17, name: "B.CrtYd", type: "user" }),
      new PcbLayerDefinition({ index: 16, name: "F.CrtYd", type: "user" }),
      new PcbLayerDefinition({ index: 19, name: "B.Fab", type: "user" }),
      new PcbLayerDefinition({ index: 18, name: "F.Fab", type: "user" }),
    ]

    layers.definitions = layerDefinitions
    kicadPcb.layers = layers

    this.finished = true
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
