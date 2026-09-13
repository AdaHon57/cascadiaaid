// Edit labels, lane membership, and positions here to update the dashboard map.
// Coordinates use the same canvas for HTML cards and SVG connectors.
export const roadmapSize = { width: 1700, height: 1210 };
export const nodeSize = { width: 224, height: 96 };

export const roadmapLanes = [
  { id: "safety", label: "Safety", x: 20 },
  { id: "id", label: "ID", x: 300 },
  { id: "insurance", label: "Insurance", x: 580 },
  { id: "aid", label: "Aid and assistance", x: 860 },
  { id: "property", label: "Property", x: 1140 },
  { id: "tax", label: "Tax & ongoing support", x: 1420 },
] as const;

type LaneId = (typeof roadmapLanes)[number]["id"];
export interface RoadmapNode {
  id: string;
  label: string;
  lane?: LaneId;
  x: number;
  y: number;
  kind?: "step" | "milestone" | "outcome";
}

export const roadmapNodes: RoadmapNode[] = [
  { id: "temporary-housing", label: "Temporary housing", lane: "safety", x: 38, y: 70 },
  {
    id: "stable-housing",
    label: "Stable housing secured",
    lane: "safety",
    x: 38,
    y: 550,
    kind: "outcome",
  },
  { id: "damage", label: "Damage documentation", lane: "id", x: 318, y: 70 },
  { id: "identity", label: "Identity replacement", lane: "id", x: 318, y: 220 },
  { id: "occupancy", label: "Proof of occupancy", lane: "id", x: 318, y: 370 },
  { id: "evidence", label: "Available evidence", lane: "id", x: 318, y: 550, kind: "milestone" },
  { id: "appeal", label: "Respond / appeal", lane: "aid", x: 878, y: 900 },
  { id: "claim", label: "Insurance claim", lane: "insurance", x: 598, y: 70 },
  {
    id: "claim-outcome",
    label: "Claim outcome",
    lane: "insurance",
    x: 598,
    y: 220,
    kind: "milestone",
  },
  {
    id: "assistance",
    label: "Public disaster assistance",
    lane: "aid",
    x: 878,
    y: 70,
    kind: "milestone",
  },
  { id: "application", label: "Prepare & submit application", lane: "aid", x: 878, y: 550 },
  { id: "review", label: "Track review & decision", lane: "aid", x: 878, y: 740 },
  {
    id: "funds",
    label: "Funds / services received",
    lane: "aid",
    x: 878,
    y: 1070,
    kind: "outcome",
  },
  {
    id: "hazards",
    label: "Hazardous-material assessment/removal",
    lane: "property",
    x: 1158,
    y: 70,
  },
  { id: "cleanup", label: "Site cleanup / readiness", lane: "property", x: 1158, y: 220 },
  { id: "permits", label: "Building permits", lane: "property", x: 1158, y: 550 },
  { id: "rebuilding", label: "Repair/rebuilding", lane: "property", x: 1158, y: 740 },
  {
    id: "safe-property",
    label: "Property safe for occupancy",
    lane: "property",
    x: 1158,
    y: 1070,
    kind: "outcome",
  },
  { id: "tax-relief", label: "Property-tax relief", lane: "tax", x: 1438, y: 70 },
  {
    id: "tax-determination",
    label: "Tax determination",
    lane: "tax",
    x: 1438,
    y: 220,
    kind: "milestone",
  },
  // Outcome status is derived from confirmed intake.
  {
    id: "tax-outcome",
    label: "Tax adjustment / refund",
    lane: "tax",
    x: 1438,
    y: 550,
    kind: "outcome",
  },
];

type Point = [number, number];
type Anchor = "top" | "bottom" | "left" | "right";
export interface RoadmapEdge {
  from: string;
  to: string;
  fromAnchor?: Anchor;
  toAnchor?: Anchor;
  toOffset?: Point;
  via?: Point[];
}

export const roadmapEdges: RoadmapEdge[] = [
  { from: "temporary-housing", to: "stable-housing" },
  { from: "damage", to: "identity" },
  { from: "identity", to: "occupancy" },
  { from: "occupancy", to: "evidence" },
  { from: "claim", to: "claim-outcome" },
  { from: "assistance", to: "application" },
  {
    from: "evidence",
    to: "application",
    fromAnchor: "right",
    toAnchor: "left",
  },
  { from: "application", to: "review" },
  {
    from: "review",
    to: "appeal",
  },
  {
    from: "appeal",
    to: "review",
    fromAnchor: "right",
    toAnchor: "right",
    via: [
      [1110, 948],
      [1110, 788],
    ],
  },
  {
    from: "review",
    to: "funds",
    fromAnchor: "left",
    toAnchor: "left",
    via: [
      [850, 788],
      [850, 1118],
    ],
  },
  { from: "hazards", to: "cleanup" },
  {
    from: "cleanup",
    to: "permits",
  },
  { from: "permits", to: "rebuilding" },
  { from: "rebuilding", to: "safe-property" },
  { from: "tax-relief", to: "tax-determination" },
  { from: "tax-determination", to: "tax-outcome" },
];

export function edgePath(edge: RoadmapEdge): string {
  function anchor(id: string, side: Anchor): Point {
    const node = roadmapNodes.find((item) => item.id === id);
    if (!node) throw new Error(`Unknown roadmap node: ${id}`);
    const { x, y } = node;
    const { width, height } = nodeSize;
    switch (side) {
      case "top":
        return [x + width / 2, y];
      case "bottom":
        return [x + width / 2, y + height];
      case "left":
        return [x, y + height / 2];
      case "right":
        return [x + width, y + height / 2];
    }
  }
  const end = anchor(edge.to, edge.toAnchor ?? "top");
  const offset = edge.toOffset ?? [0, 0];
  const points = [
    anchor(edge.from, edge.fromAnchor ?? "bottom"),
    ...(edge.via ?? []),
    [end[0] + offset[0], end[1] + offset[1]],
  ];
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
}
