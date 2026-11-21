import type {
  Flight,
  Service,
  Shift,
  Stand,
  TowLeg,
  TowPlan,
  TowTractor,
} from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { serviceCatalog } from "../../services/model/catalog";
import {
  approachDuration,
  completedWorkInvalidated,
  describeWait,
  flightById,
  locationHolder,
  reconnectFor,
  serviceTargetPoint,
  standById,
} from "../lib/tow";
import { towDepot } from "./tractors";

/** Retarget a vehicle to the aircraft's real spot after it moves. */
export function retargetVehicle(
  state: Shift,
  task: Service,
  destination: Stand | undefined,
  status: "relocating" | "travel" = "relocating",
): void {
  const vehicle = state.vehicles.find((v) => v.id === task.vehicleId);
  if (!vehicle || !destination) return;
  const target = serviceTargetPoint(destination, task.kind);
  vehicle.origin = { ...vehicle.position };
  vehicle.target = target;
  vehicle.progress = 0;
  vehicle.tripDuration = Math.max(
    4,
    5 +
      Math.hypot(target.x - vehicle.position.x, target.y - vehicle.position.y) /
        50,
  );
  vehicle.status = status;
}

/**
 * Runs the moment the tractor is hitched and the aircraft leaves its spot.
 * Every in-progress job is classified: follow, pause or reconnect.
 * Completed work is never destroyed by a tow — it belongs to the aircraft.
 */
export function applyTowImpact(
  state: Shift,
  flightId: string,
  destination: Stand | undefined,
): void {
  const notes: string[] = [];
  // Only work that is genuinely broken by this specific move is undone.
  for (const kind of completedWorkInvalidated(state, flightId, destination)) {
    const task = state.services.find(
      (t) => t.flightId === flightId && t.kind === kind,
    );
    if (!task || task.status !== "done") continue;
    task.status = "pending";
    task.progress = 0;
    task.vehicleId = undefined;
    task.pausedReason = undefined;
    task.resumeDelay = undefined;
    task.towImpact = undefined;
    task.resumeAs = undefined;
    notes.push(`${serviceCatalog[task.kind].label}成果失效`);
  }
  for (const task of state.services) {
    if (task.flightId !== flightId) continue;
    if (
      task.status === "pending" ||
      task.status === "done" ||
      task.status === "paused"
    )
      continue;
    if (task.status === "travel" && destination?.serviceCapable) {
      // The vehicle simply drives to wherever the aircraft really is.
      retargetVehicle(state, task, destination, "travel");
      task.towImpact = "follow";
      notes.push(`${serviceCatalog[task.kind].label}跟随`);
      continue;
    }
    const reconnect =
      destination?.serviceCapable === true &&
      task.status === "working" &&
      (task.kind === "fuel" || task.kind === "baggage");
    task.status = "paused";
    task.towImpact = reconnect ? "reconnect" : "pause";
    task.resumeAs = "working";
    task.resumeDelay = undefined;
    task.pausedReason = reconnect
      ? "拖移中断，停妥后需重新连接"
      : destination?.serviceCapable
        ? "拖移中暂停，停妥后继续"
        : "临时等待位无法开展保障";
    task.resumeDelay = undefined;
    const vehicle = state.vehicles.find((v) => v.id === task.vehicleId);
    if (vehicle) vehicle.status = "paused";
    notes.push(
      reconnect
        ? `${serviceCatalog[task.kind].label}重新连接`
        : `${serviceCatalog[task.kind].label}暂停`,
    );
  }
  if (notes.length)
    record(
      state,
      `${flightId} 离开 ${destination ? "原机位" : "机位"}：${notes.join("、")}`,
      "warning",
    );
}

/** Aircraft is safely chocked at a real spot again. */
export function settleArrival(
  state: Shift,
  flight: Flight,
  stand: Stand,
): void {
  flight.locationId = stand.id;
  flight.towPlanId = undefined;
  flight.status = "parked";
  for (const task of state.services) {
    if (task.flightId !== flight.id) continue;
    if (task.status === "done" || task.status === "pending") continue;
    if (!stand.serviceCapable) {
      // A holding spot is a real position but cannot run services. Mid-job
      // work stops here and is only rescheduled once a service stand is used.
      task.pausedReason = "临时等待位无法开展保障";
      task.resumeDelay = undefined;
      if (task.status === "travel" || task.status === "working") {
        task.resumeAs = task.status === "working" ? "working" : "travel";
        task.status = "paused";
      }
      const vehicle = state.vehicles.find((v) => v.id === task.vehicleId);
      if (vehicle) {
        vehicle.status = "paused";
        vehicle.holdSeconds = undefined;
      }
      continue;
    }
    if (task.status === "travel") {
      // The vehicle parks beside the aircraft's real new position.
      retargetVehicle(state, task, stand, "travel");
      continue;
    }
    task.pausedReason = undefined;
    // The vehicle must physically reach the new spot before work restarts.
    retargetVehicle(state, task, stand, "relocating");
    const vehicle = state.vehicles.find((v) => v.id === task.vehicleId);
    if (vehicle) {
      vehicle.status = "relocating";
      vehicle.holdSeconds =
        task.towImpact === "reconnect" ? reconnectFor(task) : 0;
    }
    task.resumeDelay = undefined;
  }
}

export function finishPlan(
  state: Shift,
  plan: TowPlan,
  truck: TowTractor,
): void {
  plan.status = "done";
  truck.status = "returning";
  truck.planId = undefined;
  truck.origin = { ...truck.position };
  truck.target = { ...towDepot };
  truck.progress = 0;
  truck.tripDuration = 10;
}

export function cancelPlanNow(
  state: Shift,
  plan: TowPlan,
  truck: TowTractor | undefined,
  text: string,
): void {
  plan.status = "cancelled";
  plan.cancelRequested = false;
  if (truck) {
    if (truck.status === "idle") {
      truck.planId = undefined;
    } else {
      truck.status = "returning";
      truck.planId = undefined;
      truck.origin = { ...truck.position };
      truck.target = { ...towDepot };
      truck.progress = 0;
      truck.tripDuration = 10;
    }
  }
  record(state, text, "warning");
}

function beginLeg(
  state: Shift,
  plan: TowPlan,
  truck: TowTractor,
  leg: TowLeg,
): void {
  const from = standById(state, leg.fromId);
  if (!from) return;
  leg.status = "active";
  leg.hooked = false;
  leg.approachProgress = 0;
  leg.approachDuration = approachDuration(truck.position, from);
  leg.approachOrigin = { ...truck.position };
  const flight = flightById(state, leg.flightId);
  if (flight && flight.status === "parked")
    record(state, `${plan.id} 拖车前往 ${leg.flightId}（${leg.fromId}）`, "info");
}

/** Start a waiting plan once every check passes. Origin stays occupied. */
export function tryStartPlan(state: Shift, plan: TowPlan): void {
  if (plan.status !== "waiting") return;
  const wait = describeWait(state, plan);
  if (wait.reason) {
    plan.waitReason = wait.reason;
    return;
  }
  const truck = state.towTractors.find((t) => t.id === plan.truckId);
  const leg = plan.legs[plan.activeLeg];
  const flight = leg ? flightById(state, leg.flightId) : undefined;
  if (!truck || !leg || !flight) {
    cancelPlanNow(state, plan, truck, `${plan.id} 取消：拖车或路线不可用`);
    return;
  }
  if (flight.status !== "parked") {
    cancelPlanNow(
      state,
      plan,
      truck,
      `${plan.id} 取消：${flight.id} 当前不可拖移`,
    );
    return;
  }
  plan.waitReason = undefined;
  plan.status = "towing";
  plan.startedAt = state.time;
  truck.status = "towing";
  truck.planId = plan.id;
  beginLeg(state, plan, truck, leg);
  record(
    state,
    `${plan.id} 开始执行 · ${plan.strategy === "late" ? "晚拖移" : "优先腾空"}`,
    "info",
  );
}

function completeLeg(
  state: Shift,
  plan: TowPlan,
  leg: TowLeg,
  truck: TowTractor,
): void {
  const flight = flightById(state, leg.flightId);
  const to = standById(state, leg.toId);
  if (!flight || !to) {
    cancelPlanNow(state, plan, truck, `${plan.id} 取消：目标位置丢失`);
    return;
  }
  const awaitedDeparture = flight.departureRequestedAt !== undefined;
  settleArrival(state, flight, to);
  leg.status = "done";
  truck.position = { ...to };
  record(
    state,
    `${flight.id} 已安全停妥 ${to.id}${awaitedDeparture ? " · 离港指令排队中" : ""}`,
    "success",
  );
  const nextLeg = plan.legs[plan.activeLeg + 1];
  if (nextLeg) {
    plan.activeLeg += 1;
    beginLeg(state, plan, truck, nextLeg);
    return;
  }
  finishPlan(state, plan, truck);
}

function startReturn(state: Shift, leg: TowLeg): void {
  leg.returning = true;
  record(
    state,
    `${leg.flightId} 拖移取消，沿原路线返回 ${leg.fromId}；未停妥前不恢复保障`,
    "warning",
  );
}

function completeReturn(
  state: Shift,
  plan: TowPlan,
  leg: TowLeg,
): void {
  const flight = flightById(state, leg.flightId);
  const from = standById(state, leg.fromId);
  const truck = state.towTractors.find((t) => t.id === plan.truckId);
  if (!flight || !from) {
    cancelPlanNow(state, plan, truck, `${plan.id} 取消：返回位置丢失`);
    return;
  }
  settleArrival(state, flight, from);
  record(state, `${flight.id} 已返回 ${from.id} 并停妥`, "info");
  const others = state.flights
    .filter(
      (f) =>
        f.id !== flight.id &&
        f.locationId &&
        planFlightsSafe(plan).includes(f.id),
    )
    .map((f) => `${f.id} 停在 ${f.locationId}`);
  cancelPlanNow(
    state,
    plan,
    truck,
    `${plan.id} 已取消，${flight.id} 回到 ${from.id}${
      others.length ? `；${others.join("，")}` : ""
    }`,
  );
}

function advancePlan(
  state: Shift,
  plan: TowPlan,
  seconds: number,
): void {
  const leg = plan.legs[plan.activeLeg];
  const truck = state.towTractors.find((t) => t.id === plan.truckId);
  const flight = leg ? flightById(state, leg.flightId) : undefined;
  const from = leg ? standById(state, leg.fromId) : undefined;
  const to = leg ? standById(state, leg.toId) : undefined;
  if (!leg || !truck || !flight || !from || !to) {
    cancelPlanNow(state, plan, truck, `${plan.id} 取消：拖移数据不完整`);
    return;
  }

  if (leg.returning) {
    // Drive back at the tow's normal rate; the aircraft retraces the distance
    // it has already covered, so progress simply runs back to zero.
    leg.progress = Math.max(
      0,
      leg.progress - (seconds / Math.max(1, leg.duration)) * 100,
    );
    const t = leg.progress / 100;
    truck.position = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
    if (leg.progress <= 0) completeReturn(state, plan, leg);
    return;
  }

  if (!leg.hooked) {
    if (plan.cancelRequested) {
      // The tractor has not hitched up yet: abort without touching the aircraft.
      // It never left its spot, so the spot stays occupied and services continue.
      cancelPlanNow(
        state,
        plan,
        truck,
        `${plan.id} 在挂接前取消：${flight.id} 原地未动，${from.id} 保持占用`,
      );
      return;
    }
    leg.approachProgress = Math.min(
      100,
      leg.approachProgress + (seconds / Math.max(1, leg.approachDuration)) * 100,
    );
    const t = leg.approachProgress / 100;
    truck.position = {
      x: leg.approachOrigin.x + (from.x - leg.approachOrigin.x) * t,
      y: leg.approachOrigin.y + (from.y - leg.approachOrigin.y) * t,
    };
    if (leg.approachProgress < 100) return;
    // Hooked up. This is the instant the origin spot becomes free; before it,
    // the aircraft is still fully at its original position.
    leg.hooked = true;
    flight.status = "towing";
    flight.towPlanId = plan.id;
    flight.locationId = undefined;
    applyTowImpact(state, flight.id, to);
    record(state, `拖车已挂接 ${flight.id}，${from.id} 机位释放`, "info");
    return;
  }

  if (plan.cancelRequested) {
    startReturn(state, leg);
    return;
  }

  leg.progress = Math.min(
    100,
    leg.progress + (seconds / Math.max(1, leg.duration)) * 100,
  );
  const t = leg.progress / 100;
  truck.position = {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
  if (leg.progress >= 100) completeLeg(state, plan, leg, truck);
}

export function advanceTow(state: Shift, seconds: number): Shift {
  if (state.paused) return state;
  const s = copyShift(state);
  // Idle tractors slide home; return trips end idle at the depot.
  for (const truck of s.towTractors) {
    if (truck.status === "returning") {
      truck.progress = Math.min(
        100,
        truck.progress + (seconds / Math.max(1, truck.tripDuration)) * 100,
      );
      truck.position = {
        x: truck.origin.x + (truck.target.x - truck.origin.x) * (truck.progress / 100),
        y: truck.origin.y + (truck.target.y - truck.origin.y) * (truck.progress / 100),
      };
      if (truck.progress >= 100) {
        truck.status = "idle";
        truck.planId = undefined;
      }
    }
  }
  for (const plan of s.towPlans) {
    if (plan.status === "waiting") tryStartPlan(s, plan);
    else if (plan.status === "towing") advancePlan(s, plan, seconds);
  }
  return s;
}

/** Position of an aircraft that is currently between stands. */
export function towingPosition(
  state: Shift,
  flightId: string,
): { x: number; y: number; progress: number } | undefined {
  for (const plan of state.towPlans) {
    if (plan.status !== "towing") continue;
    const leg = plan.legs[plan.activeLeg];
    if (!leg || leg.flightId !== flightId) continue;
    const from = standById(state, leg.fromId);
    const to = standById(state, leg.toId);
    if (!from || !to) continue;
    if (!leg.hooked)
      return { x: from.x, y: from.y, progress: leg.approachProgress / 100 };
    const t = leg.progress / 100;
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      progress: t,
    };
  }
  return undefined;
}

export function planLegFor(
  state: Shift,
  flightId: string,
): { plan: TowPlan; leg: TowLeg } | undefined {
  for (const plan of state.towPlans) {
    if (plan.status !== "towing") continue;
    const leg = plan.legs[plan.activeLeg];
    if (leg?.flightId === flightId) return { plan, leg };
  }
  return undefined;
}

function planFlightsSafe(plan: TowPlan): string[] {
  return plan.partnerFlightId
    ? [plan.flightId, plan.partnerFlightId]
    : [plan.flightId];
}

export function holderAt(state: Shift, locationId: string): Flight | undefined {
  return locationHolder(state, locationId);
}
