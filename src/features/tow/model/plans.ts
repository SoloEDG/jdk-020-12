import type { Shift, TowPlan, TowStrategy } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import {
  activePlan,
  approachDuration,
  findBuffer,
  flightById,
  idleTractor,
  locationHolder,
  makeLeg,
  planFits,
  relocateBlockers,
  standById,
  swapBlockers,
} from "../lib/tow";

function reject(state: Shift, message: string): Shift {
  const s = copyShift(state);
  s.conflicts++;
  s.score -= 10;
  record(s, message, "warning");
  return s;
}

function reserveTruck(s: Shift, plan: TowPlan): void {
  const truck = idleTractor(s);
  if (!truck) return;
  plan.truckId = truck.id;
  truck.planId = plan.id;
}

function refusalReason(
  state: Shift,
  flightId: string,
  toId: string,
  strategy: TowStrategy,
): string | undefined {
  const flight = flightById(state, flightId),
    strategyWord = strategy === "late" ? "晚拖移" : "立即拖移";
  if (!flight) return "拖移计划无效：航班不存在";
  if (!standById(state, toId)) return "拖移计划无效：目标位置不存在";
  if (flight.status !== "parked")
    return `${strategyWord}计划被拒绝：飞机当前不可拖移（${flight.status}）`;
  if (activePlan(state, flightId))
    return `拖移计划被拒绝：已有进行中的拖移计划`;
  return undefined;
}

export function planRelocate(
  state: Shift,
  flightId: string,
  toId: string,
  strategy: TowStrategy,
): Shift {
  const early = refusalReason(state, flightId, toId, strategy);
  if (early) return reject(state, early);
  const flight = flightById(state, flightId)!;
  const blockers = relocateBlockers(state, flight, toId);
  if (blockers.length)
    return reject(state, `拖移计划被拒绝：${blockers[0]}`);
  const s = copyShift(state);
  const fromId = flight.locationId!;
  const plan: TowPlan = {
    id: `TOW-${s.nextPlanId++}`,
    kind: "relocate",
    status: "waiting",
    strategy,
    flightId,
    toId,
    legs: [makeLeg(s, flightId, fromId, toId)],
    activeLeg: 0,
    origins: [{ flightId, standId: fromId }],
    createdAt: s.time,
  };
  reserveTruck(s, plan);
  s.towPlans.push(plan);
  const holder = locationHolder(s, toId, [flightId]);
  const target = standById(s, toId)!;
  record(
    s,
    `${strategy === "late" ? "晚拖移" : "立即拖移"}计划 ${plan.id}：${flightId} ${fromId} → ${toId}${
      holder ? ` · 等待 ${holder.id} 释放` : ""
    }`,
    "info",
  );
  if (target.kind === "holding")
    record(
      s,
      `${toId} 为临时等待位：拖入后保障暂停，原机位在挂接前保持占用`,
      "warning",
    );
  return s;
}

export function planSwap(
  state: Shift,
  flightId: string,
  partnerId: string,
  strategy: TowStrategy,
): Shift {
  const primary = flightById(state, flightId),
    partner = flightById(state, partnerId);
  if (!primary || !partner || flightId === partnerId)
    return reject(state, "换位计划无效：请选择两架不同的已停靠飞机");
  const blockers = swapBlockers(state, primary, partner);
  if (blockers.length) return reject(state, `换位计划被拒绝：${blockers[0]}`);
  const s = copyShift(state);
  const primaryStand = standById(s, primary.locationId)!,
    partnerStand = standById(s, partner.locationId)!,
    buffer = findBuffer(s, partner);
  if (!buffer) return reject(s, "换位计划被拒绝：没有可用的中转等待位");
  const plan: TowPlan = {
    id: `TOW-${s.nextPlanId++}`,
    kind: "swap",
    status: "waiting",
    strategy,
    flightId,
    toId: partnerStand.id,
    partnerFlightId: partnerId,
    bufferId: buffer.id,
    legs: [
      makeLeg(s, partnerId, partnerStand.id, buffer.id),
      makeLeg(s, flightId, primaryStand.id, partnerStand.id),
      makeLeg(s, partnerId, buffer.id, primaryStand.id),
    ],
    activeLeg: 0,
    origins: [
      { flightId, standId: primaryStand.id },
      { flightId: partnerId, standId: partnerStand.id },
    ],
    createdAt: s.time,
  };
  reserveTruck(s, plan);
  s.towPlans.push(plan);
  record(
    s,
    `${strategy === "late" ? "晚拖移" : "立即"}换位计划 ${plan.id}：${flightId}（${primaryStand.id}）⇄ ${partnerId}（${partnerStand.id}）`,
    "info",
  );
  record(
    s,
    `实际路线：${partnerId} → ${buffer.id} 中转 → ${flightId} → ${partnerStand.id} → ${partnerId} 回到 ${primaryStand.id}`,
    "info",
  );
  return s;
}

export function requestCancelPlan(state: Shift, planId: string): Shift {
  const s = copyShift(state);
  const plan = s.towPlans.find((p) => p.id === planId);
  if (!plan || plan.status === "done" || plan.status === "cancelled") return s;
  const truck = s.towTractors.find((t) => t.id === plan.truckId);
  if (plan.status === "waiting") {
    plan.status = "cancelled";
    if (truck && truck.status === "idle") truck.planId = undefined;
    record(
      s,
      `${plan.id} 已取消：飞机未移动，原机位保持占用`,
      "info",
    );
    return s;
  }
  if (plan.cancelRequested) return s;
  plan.cancelRequested = true;
  record(
    s,
    `${plan.id} 收到取消：飞机先返回原机位停妥，期间所有保障保持暂停`,
    "warning",
  );
  return s;
}

export function approachFor(state: Shift, plan: TowPlan): number {
  const truck = state.towTractors.find((t) => t.id === plan.truckId);
  const leg = plan.legs[0];
  const from = standById(state, leg?.fromId);
  if (!truck || !from) return 0;
  return approachDuration(truck.position, from);
}
