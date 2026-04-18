import type { CircuitJson } from "circuit-json"
import { cju } from "@tscircuit/circuit-json-util"

interface CircuitJsonToKicadProOptions {
  projectName?: string
  schematicFilename?: string
  pcbFilename?: string
}

interface KicadNetClass {
  bus_width: number
  clearance: number
  diff_pair_gap: number
  diff_pair_via_gap: number
  diff_pair_width: number
  line_style: number
  microvia_diameter: number
  microvia_drill: number
  name: string
  pcb_color: string
  priority: number
  schematic_color: string
  track_width: number
  via_diameter: number
  via_drill: number
  wire_width: number
}

interface KicadViaDimension {
  diameter: number
  drill: number
}

interface KicadProjectRules {
  max_error: number
  min_clearance: number
  min_connection: number
  min_copper_edge_clearance: number
  min_groove_width: number
  min_hole_clearance: number
  min_hole_to_hole: number
  min_microvia_diameter: number
  min_microvia_drill: number
  min_resolved_spokes: number
  min_silk_clearance: number
  min_text_height: number
  min_text_thickness: number
  min_through_hole_diameter: number
  min_track_width: number
  min_via_annular_width: number
  min_via_diameter: number
  solder_mask_clearance: number
  solder_mask_min_width: number
  solder_mask_to_copper_clearance: number
  use_height_for_length_calcs: boolean
}

interface KicadBoardDesignSettings {
  defaults: {
    apply_defaults_to_fp_fields: boolean
    apply_defaults_to_fp_shapes: boolean
    apply_defaults_to_fp_text: boolean
    board_outline_line_width: number
    copper_line_width: number
    copper_text_italic: boolean
    copper_text_size_h: number
    copper_text_size_v: number
    copper_text_thickness: number
    copper_text_upright: boolean
    courtyard_line_width: number
    dimension_precision: number
    dimension_units: number
    dimensions: {
      arrow_length: number
      extension_offset: number
      keep_text_aligned: boolean
      suppress_zeroes: boolean
      text_position: number
      units_format: number
    }
    fab_line_width: number
    fab_text_italic: boolean
    fab_text_size_h: number
    fab_text_size_v: number
    fab_text_thickness: number
    fab_text_upright: boolean
    other_line_width: number
    other_text_italic: boolean
    other_text_size_h: number
    other_text_size_v: number
    other_text_thickness: number
    other_text_upright: boolean
    pads: {
      drill: number
      height: number
      width: number
    }
    silk_line_width: number
    silk_text_italic: boolean
    silk_text_size_h: number
    silk_text_size_v: number
    silk_text_thickness: number
    silk_text_upright: boolean
    zones: {
      min_clearance: number
    }
  }
  diff_pair_dimensions: unknown[]
  drc_exclusions: unknown[]
  meta: {
    version: number
  }
  rule_severities: Record<string, "ignore" | "warning" | "error">
  rules: KicadProjectRules
  teardrop_options: Array<Record<string, boolean>>
  teardrop_parameters: Array<Record<string, string | number | boolean>>
  track_widths: number[]
  tuning_pattern_settings: Record<string, Record<string, number | boolean>>
  via_dimensions: KicadViaDimension[]
  zones_allow_external_fillets: boolean
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
    filename: string
    version: number
  }
  text_variables: Record<string, string>
  libraries: {
    pinned_symbol_libs: string[]
    pinned_footprint_libs: string[]
  }
  boards: string[]
  cvpcb: {
    equivalence_files: string[]
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
    classes: KicadNetClass[]
    net_colors: null
    netclass_assignments: null
    netclass_patterns: unknown[]
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
    legacy_lib_dir: string
    legacy_lib_list: string[]
  }
  board: {
    meta: {
      version: number
    }
    last_opened_board: string
    design_settings: KicadBoardDesignSettings
    ipc2581: Record<"dist" | "distpn" | "internal_id" | "mfg" | "mpn", string>
    layer_pairs: unknown[]
    layer_presets: unknown[]
    viewports: unknown[]
    "3dviewports": unknown[]
  }
  sheets: [string, string][]
}

interface ViaGeometry {
  diameter: number
  drill: number
}

interface DerivedProjectSettings {
  clearance: number
  lastNetId: number
  minThroughHoleDiameter: number
  minTrackWidth: number
  minViaAnnularWidth: number
  minViaDiameter: number
  trackWidths: number[]
  viaDimensions: ViaGeometry[]
}

const DEFAULT_TRACK_WIDTH = 0.2
const DEFAULT_VIA_DIAMETER = 0.6
const DEFAULT_VIA_DRILL = 0.3
const DEFAULT_MICROVIA_DIAMETER = 0.3
const DEFAULT_MICROVIA_DRILL = 0.1
const DEFAULT_WIRE_WIDTH = 6

const DEFAULT_RULE_SEVERITIES: Record<string, "ignore" | "warning" | "error"> =
  {
    annular_width: "error",
    clearance: "error",
    connection_width: "warning",
    copper_edge_clearance: "error",
    copper_sliver: "warning",
    courtyards_overlap: "error",
    creepage: "error",
    diff_pair_gap_out_of_range: "error",
    diff_pair_uncoupled_length_too_long: "error",
    drill_out_of_range: "error",
    duplicate_footprints: "warning",
    extra_footprint: "warning",
    footprint: "error",
    footprint_filters_mismatch: "ignore",
    footprint_symbol_mismatch: "warning",
    footprint_type_mismatch: "ignore",
    hole_clearance: "error",
    hole_to_hole: "warning",
    holes_co_located: "warning",
    invalid_outline: "error",
    isolated_copper: "warning",
    item_on_disabled_layer: "error",
    items_not_allowed: "error",
    length_out_of_range: "error",
    lib_footprint_issues: "warning",
    lib_footprint_mismatch: "warning",
    malformed_courtyard: "error",
    microvia_drill_out_of_range: "error",
    mirrored_text_on_front_layer: "warning",
    missing_courtyard: "ignore",
    missing_footprint: "warning",
    net_conflict: "warning",
    nonmirrored_text_on_back_layer: "warning",
    npth_inside_courtyard: "ignore",
    padstack: "warning",
    pth_inside_courtyard: "ignore",
    shorting_items: "error",
    silk_edge_clearance: "warning",
    silk_over_copper: "warning",
    silk_overlap: "warning",
    skew_out_of_range: "error",
    solder_mask_bridge: "error",
    starved_thermal: "error",
    text_height: "warning",
    text_on_edge_cuts: "error",
    text_thickness: "warning",
    through_hole_pad_without_hole: "error",
    too_many_vias: "error",
    track_angle: "error",
    track_dangling: "warning",
    track_segment_length: "error",
    track_width: "error",
    tracks_crossing: "error",
    unconnected_items: "error",
    unresolved_variable: "error",
    via_dangling: "warning",
    zones_intersect: "error",
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
    const projectFilename = `${projectName}.kicad_pro`
    const timestamp = new Date().toISOString()

    this.ctx = {
      db: cju(circuitJson),
      circuitJson,
    }

    const derivedSettings = this.deriveProjectSettings()
    const defaultTrackWidth =
      derivedSettings.trackWidths[0] ?? DEFAULT_TRACK_WIDTH
    const defaultVia = derivedSettings.viaDimensions[0] ?? {
      diameter: DEFAULT_VIA_DIAMETER,
      drill: DEFAULT_VIA_DRILL,
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
        filename: projectFilename,
        version: 3,
      },
      text_variables: {},
      libraries: {
        pinned_symbol_libs: [],
        pinned_footprint_libs: [],
      },
      boards: [],
      cvpcb: {
        equivalence_files: [],
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
          version: 4,
        },
        last_net_id: derivedSettings.lastNetId,
        classes: [
          {
            bus_width: 12,
            clearance: derivedSettings.clearance,
            diff_pair_gap: 0.25,
            diff_pair_via_gap: 0.25,
            diff_pair_width: defaultTrackWidth,
            line_style: 0,
            microvia_diameter: DEFAULT_MICROVIA_DIAMETER,
            microvia_drill: DEFAULT_MICROVIA_DRILL,
            name: "Default",
            pcb_color: "rgba(0, 0, 0, 0.000)",
            priority: 2147483647,
            schematic_color: "rgba(0, 0, 0, 0.000)",
            track_width: defaultTrackWidth,
            via_diameter: defaultVia.diameter,
            via_drill: defaultVia.drill,
            wire_width: DEFAULT_WIRE_WIDTH,
          },
        ],
        net_colors: null,
        netclass_assignments: null,
        netclass_patterns: [],
      },
      pcbnew: {
        page_layout_descr_file: "",
        last_paths: {
          gencad: "",
          idf: "",
          netlist: "",
          plot: "",
          pos_files: "",
          specctra_dsn: "",
          step: "",
          svg: "",
          vrml: "",
        },
      },
      schematic: {
        meta: {
          version: 1,
        },
        page_layout_descr_file: "",
        last_opened_files: [schematicFilename],
        legacy_lib_dir: "",
        legacy_lib_list: [],
      },
      board: {
        meta: {
          version: 1,
        },
        last_opened_board: pcbFilename,
        design_settings: this.createDesignSettings(
          derivedSettings,
          defaultTrackWidth,
        ),
        ipc2581: {
          dist: "",
          distpn: "",
          internal_id: "",
          mfg: "",
          mpn: "",
        },
        layer_pairs: [],
        layer_presets: [],
        viewports: [],
        "3dviewports": [],
      },
      sheets: [[this.createSheetId(), "Root"]],
    }
  }

  private createDesignSettings(
    derivedSettings: DerivedProjectSettings,
    defaultTrackWidth: number,
  ): KicadBoardDesignSettings {
    const rules: KicadProjectRules = {
      max_error: 0.005,
      min_clearance: derivedSettings.clearance,
      min_connection: 0,
      min_copper_edge_clearance: 0,
      min_groove_width: 0,
      min_hole_clearance: 0,
      min_hole_to_hole: 0,
      min_microvia_diameter: 0,
      min_microvia_drill: 0,
      min_resolved_spokes: 1,
      min_silk_clearance: 0,
      min_text_height: 0.8,
      min_text_thickness: 0.08,
      min_through_hole_diameter: derivedSettings.minThroughHoleDiameter,
      min_track_width: derivedSettings.minTrackWidth,
      min_via_annular_width: derivedSettings.minViaAnnularWidth,
      min_via_diameter: derivedSettings.minViaDiameter,
      solder_mask_clearance: 0,
      solder_mask_min_width: 0,
      solder_mask_to_copper_clearance: 0,
      use_height_for_length_calcs: true,
    }

    return {
      defaults: {
        apply_defaults_to_fp_fields: false,
        apply_defaults_to_fp_shapes: false,
        apply_defaults_to_fp_text: false,
        board_outline_line_width: 0.05,
        copper_line_width: defaultTrackWidth,
        copper_text_italic: false,
        copper_text_size_h: 1.5,
        copper_text_size_v: 1.5,
        copper_text_thickness: 0.3,
        copper_text_upright: false,
        courtyard_line_width: 0.05,
        dimension_precision: 4,
        dimension_units: 3,
        dimensions: {
          arrow_length: 1270000,
          extension_offset: 500000,
          keep_text_aligned: true,
          suppress_zeroes: true,
          text_position: 0,
          units_format: 0,
        },
        fab_line_width: 0.1,
        fab_text_italic: false,
        fab_text_size_h: 1.0,
        fab_text_size_v: 1.0,
        fab_text_thickness: 0.15,
        fab_text_upright: false,
        other_line_width: 0.1,
        other_text_italic: false,
        other_text_size_h: 1.0,
        other_text_size_v: 1.0,
        other_text_thickness: 0.15,
        other_text_upright: false,
        pads: {
          drill: 0.8,
          height: 1.27,
          width: 2.54,
        },
        silk_line_width: 0.1,
        silk_text_italic: false,
        silk_text_size_h: 1.0,
        silk_text_size_v: 1.0,
        silk_text_thickness: 0.1,
        silk_text_upright: false,
        zones: {
          min_clearance: derivedSettings.clearance,
        },
      },
      diff_pair_dimensions: [],
      drc_exclusions: [],
      meta: {
        version: 2,
      },
      rule_severities: DEFAULT_RULE_SEVERITIES,
      rules,
      teardrop_options: [
        {
          td_onpthpad: true,
          td_onroundshapesonly: false,
          td_onsmdpad: true,
          td_ontrackend: false,
          td_onvia: true,
        },
      ],
      teardrop_parameters: [
        {
          td_allow_use_two_tracks: true,
          td_curve_segcount: 0,
          td_height_ratio: 1.0,
          td_length_ratio: 0.5,
          td_maxheight: 2.0,
          td_maxlen: 1.0,
          td_on_pad_in_zone: false,
          td_target_name: "td_round_shape",
          td_width_to_size_filter_ratio: 0.9,
        },
        {
          td_allow_use_two_tracks: true,
          td_curve_segcount: 0,
          td_height_ratio: 1.0,
          td_length_ratio: 0.5,
          td_maxheight: 2.0,
          td_maxlen: 1.0,
          td_on_pad_in_zone: false,
          td_target_name: "td_rect_shape",
          td_width_to_size_filter_ratio: 0.9,
        },
        {
          td_allow_use_two_tracks: true,
          td_curve_segcount: 0,
          td_height_ratio: 1.0,
          td_length_ratio: 0.5,
          td_maxheight: 2.0,
          td_maxlen: 1.0,
          td_on_pad_in_zone: false,
          td_target_name: "td_track_end",
          td_width_to_size_filter_ratio: 0.9,
        },
      ],
      track_widths: derivedSettings.trackWidths,
      tuning_pattern_settings: {
        diff_pair_defaults: {
          corner_radius_percentage: 80,
          corner_style: 1,
          max_amplitude: 1.0,
          min_amplitude: 0.2,
          single_sided: false,
          spacing: 1.0,
        },
        diff_pair_skew_defaults: {
          corner_radius_percentage: 80,
          corner_style: 1,
          max_amplitude: 1.0,
          min_amplitude: 0.2,
          single_sided: false,
          spacing: 0.6,
        },
        single_track_defaults: {
          corner_radius_percentage: 80,
          corner_style: 1,
          max_amplitude: 1.0,
          min_amplitude: 0.2,
          single_sided: false,
          spacing: 0.6,
        },
      },
      via_dimensions: derivedSettings.viaDimensions.map((via) => ({
        diameter: via.diameter,
        drill: via.drill,
      })),
      zones_allow_external_fillets: false,
    }
  }

  private deriveProjectSettings(): DerivedProjectSettings {
    const trackWidths = this.collectTrackWidths()
    const viaDimensions = this.collectViaDimensions()
    const clearance = this.collectTraceClearance()
    const throughHoleDiameters = [
      ...viaDimensions.map((via) => via.drill),
      ...this.collectPlatedHoleDiameters(),
    ].sort((a, b) => a - b)
    const annularWidths = viaDimensions
      .map((via) => this.roundMm((via.diameter - via.drill) / 2))
      .filter((width) => Number.isFinite(width) && width >= 0)
      .sort((a, b) => a - b)

    return {
      clearance,
      lastNetId: this.ctx.db.source_net?.list()?.length ?? 0,
      minThroughHoleDiameter: throughHoleDiameters[0] ?? 0,
      minTrackWidth: trackWidths[0] ?? 0,
      minViaAnnularWidth: annularWidths[0] ?? 0,
      minViaDiameter: viaDimensions[0]?.diameter ?? 0,
      trackWidths,
      viaDimensions,
    }
  }

  private collectTrackWidths(): number[] {
    const widths = new Set<number>()
    const traces = (this.ctx.db.pcb_trace?.list() ?? []) as any[]

    for (const trace of traces) {
      if (this.isFiniteNumber(trace.width) && trace.width >= 0) {
        widths.add(this.roundMm(trace.width))
      }

      if (trace.source_trace_id) {
        const sourceTrace = this.ctx.db.source_trace?.get(
          trace.source_trace_id,
        ) as { min_trace_thickness?: unknown } | undefined
        if (
          this.isFiniteNumber(sourceTrace?.min_trace_thickness) &&
          sourceTrace.min_trace_thickness >= 0
        ) {
          widths.add(this.roundMm(sourceTrace.min_trace_thickness))
        }
      }

      const route = Array.isArray(trace.route) ? trace.route : []
      for (const point of route) {
        if (this.isFiniteNumber(point.width) && point.width >= 0) {
          widths.add(this.roundMm(point.width))
        }
      }
    }

    return [...widths].sort((a, b) => a - b)
  }

  private collectViaDimensions(): ViaGeometry[] {
    const vias = new Map<string, ViaGeometry>()
    const addVia = (diameter: unknown, drill: unknown) => {
      if (
        !this.isFiniteNumber(diameter) ||
        !this.isFiniteNumber(drill) ||
        diameter < 0 ||
        drill < 0
      ) {
        return
      }

      vias.set(`${this.roundMm(diameter)}:${this.roundMm(drill)}`, {
        diameter: this.roundMm(diameter),
        drill: this.roundMm(drill),
      })
    }

    for (const via of (this.ctx.db.pcb_via?.list() ?? []) as any[]) {
      addVia(via.outer_diameter, via.hole_diameter)
    }

    for (const trace of (this.ctx.db.pcb_trace?.list() ?? []) as any[]) {
      const route = Array.isArray(trace.route) ? trace.route : []
      for (const point of route) {
        if (point?.route_type === "via") {
          addVia(point.outer_diameter, point.hole_diameter)
        }
      }
    }

    return [...vias.values()].sort((a, b) => {
      if (a.diameter !== b.diameter) {
        return a.diameter - b.diameter
      }
      return a.drill - b.drill
    })
  }

  private collectPlatedHoleDiameters(): number[] {
    const diameters = new Set<number>()
    const platedHoles = (this.ctx.db.pcb_plated_hole?.list() ?? []) as any[]

    for (const platedHole of platedHoles) {
      const diameter = this.getPlatedHoleDiameter(platedHole)
      if (diameter !== undefined && diameter >= 0) {
        diameters.add(this.roundMm(diameter))
      }
    }

    return [...diameters].sort((a, b) => a - b)
  }

  private getPlatedHoleDiameter(
    platedHole: Record<string, unknown>,
  ): number | undefined {
    if (this.isFiniteNumber(platedHole.hole_diameter)) {
      return platedHole.hole_diameter
    }

    if (
      this.isFiniteNumber(platedHole.hole_width) &&
      this.isFiniteNumber(platedHole.hole_height)
    ) {
      return Math.min(platedHole.hole_width, platedHole.hole_height)
    }

    return undefined
  }

  private collectTraceClearance(): number {
    const clearances = new Set<number>()
    const groups = (this.ctx.db.pcb_group?.list() ?? []) as any[]

    for (const group of groups) {
      const traceClearance = group.autorouter_configuration?.trace_clearance
      if (this.isFiniteNumber(traceClearance) && traceClearance >= 0) {
        clearances.add(this.roundMm(traceClearance))
      }
    }

    return [...clearances].sort((a, b) => a - b)[0] ?? 0
  }

  private createSheetId(): string {
    return `sheet-${Math.random().toString(36).slice(2, 12)}`
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value)
  }

  private roundMm(value: number): number {
    return Number(value.toFixed(6))
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
