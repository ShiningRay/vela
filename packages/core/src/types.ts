export interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export type SnapZone = "left" | "right" | "top";
