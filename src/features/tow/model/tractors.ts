import type { ServiceKind, TowTractor } from "../../../shared/types";
export const towDepot = { x: 855, y: 452 };
export function initialTowTractors(): TowTractor[] {
  return [
    {
      id: "TT-01",
      status: "idle",
      position: { x: 812, y: 452 },
      origin: { x: 812, y: 452 },
      target: { x: 812, y: 452 },
      progress: 0,
      tripDuration: 8,
    },
    {
      id: "TT-02",
      status: "idle",
      position: { x: 886, y: 452 },
      origin: { x: 886, y: 452 },
      target: { x: 886, y: 452 },
      progress: 0,
      tripDuration: 8,
    },
  ];
}
export const reconnectSeconds: Record<ServiceKind, number> = {
  baggage: 6,
  fuel: 9,
  clean: 4,
};
