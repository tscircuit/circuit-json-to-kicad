# Named net classes

When Circuit JSON includes `source_net_class` records, project export writes
KiCad 9+ net-settings schema 4 with explicit `netclass_assignments`. Each net's
ordered `source_net_class_ids` refers to those definitions. Names, nominal
widths, class precedence, unused classes and width-inheriting classes survive
export and re-import; classes with equal widths remain distinct.

An explicit `source_net.trace_width` that differs from its class width gets a
generated width class in addition to its named memberships. Generated classes
have priority zero. Authored priorities adjust only as needed to reserve that
slot, preserving relative precedence and valid KiCad integer values. Generated
names avoid collisions with authored names.
Default remains the final fallback and uses the board's nominal width when no
explicit Default width was provided.

Board defaults and scoped Default classes are resolved for each net before
mapping them to KiCad's project-global Default. An additional width class keeps
an inherited width intact when that global fallback would change it.

Assignments use exact exported PCB net names rather than wildcard/regex patterns.
Import materializes existing matches; the original patterns for assigning future
nets are not reconstructed. Legacy width-only Circuit JSON keeps the existing
schema-3 output and generated width classes.

KiCad classes are project-global. Conflicting definitions of the same name in
different subcircuits, missing class references, contradictory membership for
one exported net name and inconsistent class precedence produce an export error.
Class records currently describe nominal widths and identity; this change does
not add a clearance matrix or preserve other KiCad net-class rule properties.

The native authoring round-trip test exports both `.kicad_pcb` and `.kicad_pro`,
re-imports their serialized contents, and checks the retained classes and
assignments. An additional test probes `A.hasNetclass(...)` through KiCad's DRC
engine when `kicad-cli` is available.
