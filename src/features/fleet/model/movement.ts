import type { Shift } from "../../../shared/types";
import { copyShift } from "../../../shared/document";
import { routePosition } from "../lib/routing";
export function advanceFleet(state: Shift, seconds: number): Shift {
  const s = copyShift(state);
  for (const v of s.vehicles) {
    if (v.status !== "travel" && v.status !== "relocating" && v.status !== "returning")
      continue;
    v.progress = Math.min(
      100,
      v.progress + (seconds / Math.max(1, v.tripDuration)) * 100,
    );
    v.position = routePosition(v);
    if (v.progress < 100) continue;
    if (v.status === "returning") {
      v.status = "idle";
      v.serviceId = undefined;
      continue;
    }
    const task = s.services.find((t) => t.id === v.serviceId);
    if (!task || task.status === "done") {
      v.status = "idle";
      v.serviceId = undefined;
      continue;
    }
    if (v.status === "relocating") {
      // Parked beside the aircraft. Hook-up time is spent here, not in the
      // service timer, so a reconnection delay is a real delay.
      const hold = v.holdSeconds ?? 0;
      if (hold > 0) {
        v.holdSeconds = Math.max(0, hold - seconds);
        continue;
      }
      v.holdSeconds = undefined;
    }
    const flight = s.flights.find((f) => f.id === task.flightId);
    const stand = s.stands.find((x) => x.id === flight?.locationId);
    const atAircraft =
      flight?.status === "parked" && stand?.serviceCapable === true;
    if (!atAircraft) {
      // The aircraft moved or is still in transit: hold here, do not pretend
      // the vehicle is working. It will be retargeted once the aircraft parks.
      v.status = "paused";
      continue;
    }
    if (task.status === "travel") {
      task.status = "working";
      task.pausedReason = undefined;
    }
    v.status = "working";
  }
  return s;
}
