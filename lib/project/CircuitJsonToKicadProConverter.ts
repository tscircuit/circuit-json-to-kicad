import { cju } from "@tscircuit/circuit-json-util"
import type { CircuitJson, PcbBoard } from "circuit-json"

interface CircuitJsonToKicadProOptions {
  projectName?: string
  schematicFilename?: string
  pcbFilename?: string
}

interface KicadProNetClass {
  bus_width?: number
  clearance?: number
  diff_pair_gap?: number
  diff_pair_via_gap?: number
  diff_pair_width?: number
  line_style?: number
  microvia_diameter?: number
  microvia_drill?: number
  name?: string
  pcb_color?: string
  priority?: number
  schematic_color?: string
  track_width?: number
  via_diameter?: number
  via_drill?: number
  wire_width?: number
}

interface KicadProProject {
  version: number
  head: {
    generator: string
    generator_version: string
    project_name: string
    created: string
    modified: string
  }
  meta: {
    version: number
  }
  text_variables: Record<string, string>
  libraries: {
    pinned_symbol_libs: string[]
    pinned_footprint_libs: string[]
  }
  boards: string[]
  cvpcb: {
    meta: {
      version: number
    }
  }
  erc: {
    meta: {
      version: number
    }
    erc_exclusions: unknown[]
  }
  net_settings: {
    meta: {
      version: number
    }
    last_net_id: number
    classes: KicadProNetClass[]
  }
  pcbnew: {
    page_layout_descr_file: string
    last_paths: Record<string, string>
  }
  schematic: {
    meta: {
      version: number
    }
    page_layout_descr_file: string
    last_opened_files: string[]
  }
  board: {
    meta: {
      version: number
    }
    design_settings: {
      rules: {
        allow_blind_buried_vias?: boolean
        allow_microvias?: boolean
        max_error?: number
        min_clearance?: number
        min_connection?: number
        min_copper_edge_clearance?: number
        min_groove_width?: number
        min_hole_clearance?: number
        min_hole_to_hole?: number
        min_microvia_diameter?: number
        min_microvia_drill?: number
        min_resolved_spokes?: number
        min_silk_clearance?: number
        min_text_height?: number
        min_text_thickness?: number
        min_through_hole_diameter?: number
        min_track_width?: number
        min_via_annular_width?: number
        min_via_diameter?: number
        solder_mask_clearance?: number
        solder_mask_min_width?: number
        solder_mask_to_copper_clearance?: number
        use_height_for_length_calcs?: boolean
      }
    }
    last_opened_board: string
  }
  sheets: [string, string][]
}

export class CircuitJsonToKicadProConverter {
  ctx: {
    db: ReturnType<typeof cju>
    circuitJson: CircuitJson
  }

  private project: KicadProProject

  private createBaseNetClass(params: {
    name: string
    clearance: number
    trackWidth: number
    viaDiameter: number
    viaDrill: number
  }): KicadProNetClass {
    return {
      name: params.name,
      track_width: params.trackWidth,
      via_diameter: params.viaDiameter,
      via_drill: params.viaDrill,
      clearance: params.clearance,
    }
  }

  constructor(
    circuitJson: CircuitJson,
    options: CircuitJsonToKicadProOptions = {},
  ) {
    const projectName =
      options.projectName ??
      // @ts-expect-error project metadata is optional in circuit json
      circuitJson?.project?.name ??
      "circuit-json-project"

    const schematicFilename =
      options.schematicFilename ?? `${projectName}.kicad_sch`
    const pcbFilename = options.pcbFilename ?? `${projectName}.kicad_pcb`
    const timestamp = new Date().toISOString()

    this.ctx = {
      db: cju(circuitJson),
      circuitJson,
    }

    const pcbBoard = circuitJson.filter(
      (component) => component.type === "pcb_board",
    )[0] as PcbBoard

    const minViaDiameter = pcbBoard?.min_via_pad_diameter ?? 0.3
    const minViaDrill = pcbBoard?.min_via_hole_diameter ?? 0.2
    const minViaAnnularWidth = (minViaDiameter - minViaDrill) / 2
    const minTraceToPadSpacing = pcbBoard?.min_trace_to_pad_spacing ?? 0.1
    const minTrackWidth = pcbBoard?.min_trace_width ?? 0.16
    const netClasses: KicadProNetClass[] = [
      this.createBaseNetClass({
        name: "Default",
        viaDiameter: minViaDiameter,
        viaDrill: minViaDrill,
        clearance: minTraceToPadSpacing,
        trackWidth: minTrackWidth,
      }),
    ]

    this.project = {
      version: 1,
      head: {
        generator: "circuit-json-to-kicad",
        generator_version: "0.0.1",
        project_name: projectName,
        created: timestamp,
        modified: timestamp,
      },
      meta: {
        version: 1,
      },
      text_variables: {},
      libraries: {
        pinned_symbol_libs: [],
        pinned_footprint_libs: [],
      },
      boards: [],
      cvpcb: {
        meta: {
          version: 0,
        },
      },
      erc: {
        meta: {
          version: 0,
        },
        erc_exclusions: [],
      },
      net_settings: {
        meta: {
          version: 1,
        },
        last_net_id: netClasses.length - 1,
        classes: netClasses,
      },
      pcbnew: {
        page_layout_descr_file: "",
        last_paths: {},
      },
      schematic: {
        meta: {
          version: 1,
        },
        page_layout_descr_file: "",
        last_opened_files: [schematicFilename],
      },
      board: {
        meta: {
          version: 1,
        },
        design_settings: {
          rules: {
            min_via_annular_width: minViaAnnularWidth,
            min_hole_clearance: minTraceToPadSpacing,
          },
        },
        last_opened_board: pcbFilename,
      },
      sheets: [[Math.random().toString(36).substring(2, 15), "Root"]],
    }
  }

  runUntilFinished() {
    // Nothing to do for project conversion, the project is generated eagerly
  }

  getOutput(): KicadProProject {
    return this.project
  }

  getOutputString(): string {
    return `${JSON.stringify(this.project, null, 2)}\n`
  }
}
