import type { Flight, Shift } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { flightReady } from "../../flights/lib/readiness";
import { standById } from "../../tow/lib/tow";

export function advanceClock(state: Shift, seconds: number): Shift {
  if (state.paused) return state;
  const s = copyShift(state);
  s.time += seconds;
  for (const f of s.flights) {
    if (f.status === "scheduled" && s.time >= f.arrival) {
      f.status = "incoming";
      record(s, `${f.id} 已进入进港队列`);
    }
    if (f.status === "departing" && s.time - (f.departureAt ?? s.time) >= 12) {
      const stand = standById(s, f.locationId);
      f.status = "departed";
      f.departureAt = f.departureAt ?? s.time;
      record(
        s,
        `${f.id} 已离港，机位 ${stand?.id ?? "—"} 释放`,
        "success",
      );
      f.locationId = undefined;
    }
    // A clearance that arrived during a tow is honoured only once the aircraft
    // is safely chocked and every job is finished.
    if (
      f.departureRequestedAt !== undefined &&
      f.status === "parked" &&
      standById(s, f.locationId)?.serviceCapable === true &&
      flightReady(s, f.id)
    ) {
      approveDeparture(s, f);
    }
  }
  return s;
}

export function approveDeparture(s: Shift, f: Flight): void {
  f.departureRequestedAt = undefined;
  f.status = "departing";
  f.departureAt = s.time;
  const delay = Math.max(0, s.time - f.deadline);
  const points = Math.max(20, 120 - Math.floor(delay));
  s.score += points;
  record(s, `${f.id} 停妥并完成保障，按排队指令推出 · +${points} 分`, "success");
}

export function togglePause(s: Shift): Shift {
  return { ...s, paused: !s.paused };
}
export function changeSpeed(s: Shift): Shift {
  return { ...s, speed: s.speed === 1 ? 2 : s.speed === 2 ? 4 : 1 };
}
