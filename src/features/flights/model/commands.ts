import type { Shift } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { flightReady } from "../lib/readiness";
import {
  activePlan,
  planFlights,
  planOccupiesSpot,
  standById,
} from "../../tow/lib/tow";
export function assignStand(state: Shift, id: string, standId: string): Shift {
  const s = copyShift(state),
    f = s.flights.find((x) => x.id === id),
    stand = s.stands.find((x) => x.id === standId);
  if (!f || !stand) return state;
  const occupied = s.flights.some(
    (x) => x.locationId === standId && x.status !== "departed",
  );
  const reserved = s.towPlans.some(
    (p) =>
      (p.status === "waiting" || p.status === "towing") &&
      planOccupiesSpot(p, standId),
  );
  if (
    f.status !== "incoming" ||
    occupied ||
    reserved ||
    !stand.serviceCapable ||
    (f.size === "wide" && stand.size !== "wide")
  ) {
    s.conflicts++;
    s.score -= 10;
    record(
      s,
      reserved
        ? "机位指令冲突：该位置已被拖移计划预留"
        : "机位指令冲突：请检查尺寸、占用与航班状态",
      "warning",
    );
    return s;
  }
  f.locationId = standId;
  f.status = "parked";
  s.selectedStandId = standId;
  record(s, `${id} 已停靠 ${standId}，可开始保障`, "success");
  return s;
}
export function departFlight(state: Shift, id: string): Shift {
  const s = copyShift(state),
    f = s.flights.find((x) => x.id === id);
  if (!f) return state;
  const plan = activePlan(s, id);
  if (plan)
    return requestDeparture(s, id);
  if (
    f.status !== "parked" ||
    !flightReady(s, id) ||
    standById(s, f.locationId)?.serviceCapable !== true
  ) {
    record(s, "离港未获许可：请先完成全部地勤任务", "warning");
    return s;
  }
  f.status = "departing";
  f.departureAt = s.time;
  const delay = Math.max(0, s.time - f.deadline);
  const points = Math.max(20, 120 - Math.floor(delay));
  s.score += points;
  record(s, `${id} 获准推出 · +${points} 分`, "success");
  return s;
}
/**
 * A departure clearance can arrive while the aircraft is still being towed or
 * a tow is still being planned. It is queued, never acted on until the
 * aircraft is safely chocked at a real spot.
 */
export function requestDeparture(state: Shift, id: string): Shift {
  const s = copyShift(state),
    f = s.flights.find((x) => x.id === id),
    plan = s.towPlans.find(
      (p) =>
        (p.status === "waiting" || p.status === "towing") &&
        planFlights(p).includes(id),
    );
  if (!f) return state;
  if (f.status === "towing" || (plan && plan.status === "towing")) {
    if (f.departureRequestedAt === undefined) {
      f.departureRequestedAt = s.time;
      record(
        s,
        `${id} 收到离港指令，但仍在拖移，须停妥后方可推出`,
        "warning",
      );
    }
    return s;
  }
  if (f.status !== "parked" || !flightReady(s, id)) {
    record(s, "离港未获许可：请先完成全部地勤任务", "warning");
    return s;
  }
  if (plan) {
    // Still waiting: the aircraft is physically parked and safe, so it may
    // leave directly. The pending plan is cancelled because its origin frees.
    plan.status = "cancelled";
    const truck = s.towTractors.find((t) => t.id === plan.truckId);
    if (truck && truck.status !== "idle") {
      truck.status = "returning";
      truck.origin = { ...truck.position };
      truck.target = { x: 850, y: 455 };
      truck.progress = 0;
      truck.tripDuration = 10;
    }
    if (truck) truck.planId = undefined;
    record(s, `${plan.id} 因离港取消`, "info");
  }
  f.status = "departing";
  f.departureAt = s.time;
  const delay = Math.max(0, s.time - f.deadline);
  const points = Math.max(20, 120 - Math.floor(delay));
  s.score += points;
  record(s, `${id} 获准推出 · +${points} 分`, "success");
  return s;
}
export function cancelDepartureRequest(state: Shift, id: string): Shift {
  const s = copyShift(state),
    f = s.flights.find((x) => x.id === id);
  if (!f || f.departureRequestedAt === undefined) return s;
  f.departureRequestedAt = undefined;
  record(s, `${id} 已解除离港排队，可继续拖移与保障`, "info");
  return s;
}
export function selectFlight(state: Shift, id: string): Shift {
  return {
    ...state,
    selectedFlightId: id,
    selectedStandId: state.flights.find((f) => f.id === id)?.locationId,
  };
}
