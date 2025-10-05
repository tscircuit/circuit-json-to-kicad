import type { CircuitJson } from "circuit-json"
import { cju } from "@tscircuit/circuit-json-util"
import { randomUUID } from "crypto"

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
        last_opened_board: pcbFilename,
      },
      sheets: [[randomUUID(), "Root"]],
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
