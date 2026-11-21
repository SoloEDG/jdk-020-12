import type { Shift } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { serviceCatalog } from "./catalog";
import { standById } from "../../tow/lib/tow";
export function advanceServices(state: Shift, seconds: number): Shift {
  if (state.paused) return state;
  const s = copyShift(state);
  for (const task of s.services) {
    const flight = s.flights.find((f) => f.id === task.flightId);
    const vehicle = s.vehicles.find((v) => v.id === task.vehicleId);
    if (task.status === "paused") {
      const stand = standById(s, flight?.locationId);
      const canResume =
        flight?.status === "parked" &&
        stand?.serviceCapable === true &&
        vehicle?.status === "working" &&
        vehicle.progress >= 100;
      if (!canResume) continue;
      task.resumeDelay = Math.max(0, (task.resumeDelay ?? 0) - seconds);
      if (task.resumeDelay > 0) continue;
      task.status = "working";
      task.resumeDelay = undefined;
      task.towImpact = undefined;
      task.pausedReason = undefined;
      record(
        s,
        `${vehicle?.id ?? task.vehicleId} 已就位 ${task.flightId} · ${serviceCatalog[task.kind].label}恢复`,
        "info",
      );
      continue;
    }
    if (task.status !== "working") continue;
    task.progress = Math.min(
      100,
      task.progress + (seconds / Math.max(1, task.duration)) * 100,
    );
    if (task.progress >= 100) {
      task.status = "done";
      task.progress = 100;
      const v = s.vehicles.find((x) => x.id === task.vehicleId);
      if (v) {
        v.status = "returning";
        v.origin = { ...v.position };
        v.target = { x: 830, y: 480 };
        v.progress = 0;
        v.tripDuration = 10;
      }
      record(
        s,
        `${task.flightId} ${serviceCatalog[task.kind].label}完成`,
        "success",
      );
    }
  }
  return s;
}
