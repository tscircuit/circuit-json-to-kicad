export function createGenericChipSymbolData(schematicComp: any, db: any): any {
  // Get all ports for this component
  const schematicPorts = db.schematic_port
    .list()
    .filter(
      (p: any) =>
        p.schematic_component_id === schematicComp.schematic_component_id,
    )
    .sort((a: any, b: any) => (a.pin_number || 0) - (b.pin_number || 0))

  // Create box primitives based on component size
  const width = schematicComp.size?.width || 1.5
  const height = schematicComp.size?.height || 1

  const boxPath = {
    type: "path",
    points: [
      { x: -width / 2, y: -height / 2 },
      { x: width / 2, y: -height / 2 },
      { x: width / 2, y: height / 2 },
      { x: -width / 2, y: height / 2 },
      { x: -width / 2, y: -height / 2 },
    ],
  }

  // Create ports from schematic ports
  const ports = schematicPorts.map((port: any) => {
    // Get port position relative to component center
    const portX = port.center.x - schematicComp.center.x
    const portY = port.center.y - schematicComp.center.y

    return {
      x: portX,
      y: portY,
      labels: [port.display_pin_label || `${port.pin_number || 1}`],
      pinNumber: port.pin_number || 1,
    }
  })

  return {
    center: { x: 0, y: 0 },
    primitives: [boxPath],
    ports: ports,
    size: { width, height },
  }
}
