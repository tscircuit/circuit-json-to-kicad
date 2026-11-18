# Imported KiCad net settings

This converter preserves imported KiCad project rules without adding a native
net-class model. Routing continues to use `source_net.trace_width`.

`source_project_metadata.metadata.kicad_project.net_settings` holds the original
KiCad settings. Export retains definitions, assignments, patterns, priorities,
unused classes, and fields the converters do not interpret. It does not rebuild
those settings from equal numerical widths or translate them into native rules.
Inputs without this metadata keep the existing width-based project export.

The importer also records each original net name and its Circuit JSON alias in
`source_net.metadata.kicad_net`. Export restores the original name while that
alias is unchanged, keeping project assignments and pattern matching consistent
with the PCB. An explicit rename uses the current name; retained KiCad rules
then apply to that name according to KiCad's own matching behavior.

Retained project settings are authoritative for project export. Editing native
widths does not rewrite imported rule definitions. Omit the project preservation
metadata to regenerate project rules from native widths. Several imported
projects require separate exports; this converter does not invent a merge policy
for conflicting project-global settings.
