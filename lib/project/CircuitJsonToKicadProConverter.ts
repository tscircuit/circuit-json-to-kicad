import { cju } from "@tscircuit/circuit-json-util"
import type { CircuitJson, PcbBoard } from "circuit-json"

interface CircuitJsonToKicadProOptions {
  projectName?: string
  schematicFilename?: string
  pcbFilename?: string
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
    classes: unknown[]
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
        last_net_id: 0,
        classes: [],
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
