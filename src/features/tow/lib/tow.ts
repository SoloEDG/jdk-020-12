import type {
  Flight,
  Point,
  Service,
  ServiceImpact,
  ServiceKind,
  ServiceStatus,
  Shift,
  Stand,
  TowLeg,
  TowPlan,
  TowPreview,
  TowStrategy,
  TowTractor,
} from "../../../shared/types";
import { reconnectSeconds } from "../model/tractors";

export const towSpeed = 50;
export const approachSpeed = 120;

export function towDuration(a: Point, b: Point): number {
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  return Math.max(8, Math.round(6 + (distance / towSpeed) * 6));
}

export function approachDuration(a: Point, b: Point): number {
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  return Math.max(2, Math.round(2 + distance / approachSpeed));
}

export function makeLeg(
  state: Shift,
  flightId: string,
  fromId: string,
  toId: string,
): TowLeg {
  const from = standById(state, fromId),
    to = standById(state, toId),
    fromPoint = from ?? { x: 0, y: 0 },
    toPoint = to ?? { x: 0, y: 0 };
  return {
    flightId,
    fromId,
    toId,
    status: "pending",
    progress: 0,
    duration: towDuration(fromPoint, toPoint),
    approachProgress: 0,
    approachDuration: 0,
    approachOrigin: { ...fromPoint },
  };
}

export function standById(state: Shift, id?: string): Stand | undefined {
  return state.stands.find((s) => s.id === id);
}

export function flightById(state: Shift, id: string): Flight | undefined {
  return state.flights.find((f) => f.id === id);
}

export function planFlights(plan: TowPlan): string[] {
  return plan.partnerFlightId
    ? [plan.flightId, plan.partnerFlightId]
    : [plan.flightId];
}

export function activePlan(state: Shift, flightId: string): TowPlan | undefined {
  return state.towPlans.find(
    (p) =>
      (p.status === "waiting" || p.status === "towing") &&
      planFlights(p).includes(flightId),
  );
}

export function locationHolder(
  state: Shift,
  locationId: string,
  ignore: string[] = [],
): Flight | undefined {
  return state.flights.find(
    (f) =>
      f.locationId === locationId &&
      f.status !== "departed" &&
      !ignore.includes(f.id),
  );
}

export function reservedTractorIds(state: Shift): Set<string> {
  return new Set(
    state.towPlans
      .filter((p) => p.status === "waiting" || p.status === "towing")
      .map((p) => p.truckId)
      .filter((id): id is string => id !== undefined),
  );
}

export function idleTractor(state: Shift): TowTractor | undefined {
  const reserved = reservedTractorIds(state);
  return state.towTractors.find(
    (t) => t.status === "idle" && !reserved.has(t.id),
  );
}

export function planFits(size: Flight["size"], stand: Stand): boolean {
  return size === "narrow" || stand.size === "wide";
}

export function firstLegOf(plan: TowPlan): TowLeg | undefined {
  return plan.legs[plan.activeLeg];
}

export function serviceTargetPoint(stand: Stand, kind: ServiceKind): Point {
  return {
    x: stand.x + (kind === "fuel" ? 62 : 48),
    y: stand.y + (kind === "clean" ? 30 : 8),
  };
}

/**
 * How an in-progress job reacts when its aircraft leaves the spot.
 * Completed results are never invalidated: they belong to the aircraft, not
 * the concrete, so a tow alone does not undo finished work.
 */
/**
 * Completed work belongs to the aircraft, not the concrete. It survives a tow
 * unless the move genuinely breaks it. The one modelled case: a finished cabin
 * clean is void if the aircraft is pulled off-gate to a non-service holding
 * spot while the cargo hold is still open (baggage job in progress) — the cabin
 * cannot be kept secure, so it must be cleaned again.
 */
export function completedWorkInvalidated(
  state: Shift,
  flightId: string,
  destination: Stand | undefined,
): ServiceKind[] {
  if (destination?.serviceCapable) return [];
  const baggageRunning = state.services.some(
    (t) =>
      t.flightId === flightId &&
      t.kind === "baggage" &&
      (t.status === "working" || t.status === "travel" || t.status === "paused"),
  );
  if (!baggageRunning) return [];
  return state.services
    .filter(
      (t) => t.flightId === flightId && t.kind === "clean" && t.status === "done",
    )
    .map((t) => t.kind);
}

export function serviceImpact(
  service: Service,
  destination: Stand | undefined,
  invalidated: ServiceKind[] = [],
): ServiceImpact {
  if (invalidated.includes(service.kind) && service.status === "done")
    return "invalidate";
  if (service.status === "done") return "unaffected";
  if (service.status === "pending") return "unaffected";
  if (!destination?.serviceCapable) return "pause";
  if (service.status === "travel") return "follow";
  if (service.kind === "fuel") return "reconnect";
  return "pause";
}

export function impactLabel(impact: ServiceImpact): string {
  return {
    follow: "跟随继续",
    pause: "必须暂停",
    reconnect: "重新连接",
    unaffected: "成果保留",
    invalidate: "成果失效重做",
  }[impact];
}

export function impactTone(impact: ServiceImpact): string {
  const classNames: Record<ServiceImpact, string> = {
    follow: "follow",
    pause: "pause",
    reconnect: "reconnect",
    unaffected: "safe",
    invalidate: "invalidate",
  };
  return classNames[impact];
}

export function serviceStatusLabel(status: ServiceStatus): string {
  return {
    pending: "待派遣",
    travel: "车辆前往中",
    working: "作业中",
    paused: "已暂停",
    done: "已完成",
  }[status];
}

export function reconnectFor(service: Service): number {
  return reconnectSeconds[service.kind];
}

export function activeJourneysOn(state: Shift, flightId: string): Service[] {
  return state.services.filter(
    (t) =>
      t.flightId === flightId &&
      (t.status === "working" || t.status === "travel"),
  );
}

export function remainingWorkSeconds(state: Shift, flightId: string): number {
  return Math.ceil(
    state.services
      .filter(
        (t) => t.flightId === flightId && t.status === "working",
      )
      .reduce(
        (longest, t) =>
          Math.max(longest, ((100 - t.progress) / 100) * t.duration),
        0,
      ),
  );
}

/**
 * Every spot a plan will occupy: its final target, its buffer, and each leg's
 * destination. A relocate's origin is not claimed because the plan vacates it,
 * but a swap's final destination is always one of its leg targets.
 */
export function planSpots(plan: TowPlan): string[] {
  const spots = new Set<string>([plan.toId]);
  if (plan.bufferId) spots.add(plan.bufferId);
  for (const leg of plan.legs) spots.add(leg.toId);
  return [...spots];
}

export function planOccupiesSpot(plan: TowPlan, locationId: string): boolean {
  return planSpots(plan).includes(locationId);
}

export function reservedTarget(
  state: Shift,
  locationId: string,
  selfId?: string,
): TowPlan | undefined {
  return state.towPlans.find(
    (p) =>
      p.id !== selfId &&
      (p.status === "waiting" || p.status === "towing") &&
      planOccupiesSpot(p, locationId),
  );
}

/** Why a waiting plan cannot begin yet. Origin stays occupied until hitch-up. */
export function describeWait(
  state: Shift,
  plan: TowPlan,
): { reason?: string; seconds?: number } {
  if (plan.status !== "waiting") return {};
  const leg = plan.legs[plan.activeLeg] ?? plan.legs[0];
  if (!leg) return { reason: "拖移路线缺失" };
  const target = standById(state, leg.toId);
  if (!target) return { reason: "目标位置不存在" };
  const involved = planFlights(plan);
  const holder = locationHolder(state, leg.toId, involved);
  if (holder) {
    if (holder.status === "departing" && holder.departureAt !== undefined) {
      return {
        reason: `${target.id} 被 ${holder.id} 占用，等待其推出释放`,
        seconds: Math.ceil(Math.max(0, 12 - (state.time - holder.departureAt))),
      };
    }
    const holderPlan = activePlan(state, holder.id);
    if (holderPlan)
      return {
        reason: `${target.id} 被 ${holder.id} 占用，等待其拖移完成`,
      };
    return { reason: `${target.id} 仍被 ${holder.id} 占用` };
  }
  const reserved = reservedTarget(state, leg.toId, plan.id);
  if (reserved)
    return { reason: `${target.id} 已被计划 ${reserved.id} 锁定` };
  if (plan.bufferId) {
    const buffer = standById(state, plan.bufferId);
    if (!buffer) return { reason: "中转等待位不存在" };
    const bufferHolder = locationHolder(state, buffer.id, involved);
    if (bufferHolder)
      return { reason: `${buffer.id} 中转位被 ${bufferHolder.id} 占用` };
    if (reservedTarget(state, buffer.id, plan.id))
      return { reason: `${buffer.id} 中转位已被其他计划锁定` };
  }
  if (plan.strategy === "late") {
    const active = involved.flatMap((id) => activeJourneysOn(state, id));
    if (active.length)
      return {
        reason: `晚拖移：等待 ${active.length} 项在途保障结束`,
        seconds: remainingWorkSeconds(state, plan.flightId) || undefined,
      };
  }
  return {};
}

export function relocateBlockers(
  state: Shift,
  flight: Flight,
  toId: string,
): string[] {
  const blockers: string[] = [];
  if (flight.status === "incoming" || flight.status === "scheduled")
    blockers.push("飞机尚未停靠，无法拖移");
  if (flight.status === "departing" || flight.status === "departed")
    blockers.push("飞机已进入离港流程");
  if (flight.status === "towing") blockers.push("该飞机正在拖移途中");
  if (activePlan(state, flight.id)) blockers.push("该飞机已有拖移计划");
  if (flight.departureRequestedAt !== undefined)
    blockers.push("已收到离港指令，须先解除排队");
  const to = standById(state, toId);
  if (!to) return [...blockers, "目标位置不存在"];
  if (!planFits(flight.size, to))
    blockers.push(
      to.size === "wide"
        ? "机型不匹配"
        : `${to.id} 为窄体机位，宽体机不可进入`,
    );
  if (!to.towable) blockers.push(`${to.id} 不可拖入`);
  if (flight.locationId === toId) blockers.push("飞机已在该位置");
  if (!idleTractor(state)) blockers.push("没有可用的拖车");
  // An occupied target is not a hard blocker: the plan may wait for the other
  // aircraft to depart or be towed away. The origin stays reserved meanwhile.
  if (reservedTarget(state, toId))
    blockers.push(`${toId} 已被另一项拖移计划锁定`);
  // Two aircraft that each wait for the other's spot can never move; a real
  // intermediate buffer is required instead of "swapping labels".
  if (createsTowCycle(state, flight, toId))
    blockers.push("双方互相等待对方机位：需使用带中转等待位的换位计划");
  return blockers;
}

/**
 * Walk the chain of "who is waiting for whom" starting at the target holder.
 * If the chain returns to `flight`, the two plans deadlock and must go through
 * an intermediate buffer instead.
 */
export function createsTowCycle(
  state: Shift,
  flight: Flight,
  toId: string,
): boolean {
  const seen = new Set<string>();
  let current = locationHolder(state, toId, [flight.id]);
  while (current) {
    if (current.id === flight.id) return true;
    if (seen.has(current.id)) return false;
    seen.add(current.id);
    const plan = activePlan(state, current.id);
    const nextTarget = plan?.legs[plan.activeLeg]?.toId;
    if (!plan || !nextTarget) return false;
    current = locationHolder(state, nextTarget, [current.id]);
  }
  return false;
}

export function swapBlockers(
  state: Shift,
  primary: Flight,
  partner: Flight,
): string[] {
  const blockers: string[] = [];
  if (primary.id === partner.id) return ["请选择另一架飞机作为交换对象"];
  if (primary.status !== "parked" || partner.status !== "parked")
    blockers.push("只有已停靠的飞机可以交换位置");
  if (activePlan(state, primary.id) || activePlan(state, partner.id))
    blockers.push("任一飞机已有拖移计划");
  if (
    primary.departureRequestedAt !== undefined ||
    partner.departureRequestedAt !== undefined
  )
    blockers.push("已收到离港指令，须先解除排队");
  const a = standById(state, primary.locationId),
    b = standById(state, partner.locationId);
  if (!a || !b) blockers.push("飞机位置未知");
  else {
    if (!planFits(primary.size, b))
      blockers.push(`${b.id} 无法停放 ${primary.id}（机型不匹配）`);
    if (!planFits(partner.size, a))
      blockers.push(`${a.id} 无法停放 ${partner.id}（机型不匹配）`);
    if (!a.towable || !b.towable) blockers.push("机位不可拖入");
    if (a.id === b.id) blockers.push("两架飞机已共用同一位置");
  }
  if (!findBuffer(state, partner))
    blockers.push("两机交换需要实际中转等待位，当前没有可用中转位");
  if (!idleTractor(state)) blockers.push("没有可用的拖车");
  return blockers;
}

export function findBuffer(
  state: Shift,
  partner: Flight,
  planId?: string,
): Stand | undefined {
  return state.stands.find(
    (stand) =>
      stand.kind === "holding" &&
      stand.towable &&
      planFits(partner.size, stand) &&
      !locationHolder(state, stand.id) &&
      !reservedTarget(state, stand.id, planId),
  );
}

/**
 * Preview the same classification the engine will apply. Completed jobs are
 * shown as unaffected: a tow alone never invalidates finished work.
 */
export function previewImpacts(
  state: Shift,
  flightId: string,
  destination: Stand | undefined,
) {
  const invalidated = completedWorkInvalidated(state, flightId, destination);
  return state.services
    .filter((t) => t.flightId === flightId && t.status !== "pending")
    .map((t) => ({
      flightId,
      kind: t.kind,
      status: t.status,
      impact: serviceImpact(t, destination, invalidated),
    }));
}

/** Time a late tow will spend waiting for in-progress jobs to finish. */
export function lateWaitSeconds(state: Shift, flightIds: string[]): number {
  return Math.ceil(
    Math.max(
      0,
      ...flightIds.flatMap((id) =>
        activeJourneysOn(state, id).map((t) => {
          if (t.status === "working")
            return ((100 - t.progress) / 100) * t.duration;
          const v = state.vehicles.find((x) => x.id === t.vehicleId);
          return v ? Math.max(0, v.tripDuration * (1 - v.progress / 100)) : 0;
        }),
      ),
    ),
  );
}

/** Extra recovery time an immediate tow imposes on interrupted jobs. */
export function recoverySeconds(state: Shift, flightIds: string[]): number {
  return state.services
    .filter(
      (t) =>
        flightIds.includes(t.flightId) &&
        (t.status === "working" || t.status === "travel"),
    )
    .reduce((sum, t) => sum + reconnectFor(t), 0);
}

export function previewRelocate(
  state: Shift,
  flight: Flight,
  toId: string,
  strategy: TowStrategy,
): TowPreview {
  const target = standById(state, toId);
  const plan: TowPlan = {
    id: "preview",
    kind: "relocate",
    status: "waiting",
    strategy,
    flightId: flight.id,
    toId,
    legs: [makeLeg(state, flight.id, flight.locationId ?? "", toId)],
    activeLeg: 0,
    origins: [{ flightId: flight.id, standId: flight.locationId ?? "" }],
    createdAt: state.time,
  };
  const wait = describeWait(state, plan);
  const blockers = relocateBlockers(state, flight, toId);
  return {
    kind: "relocate",
    strategy,
    primaryFlightId: flight.id,
    targetId: toId,
    legs: plan.legs,
    waitReason: wait.reason,
    waitSeconds: wait.seconds,
    lateWaitSeconds: strategy === "late" ? lateWaitSeconds(state, [flight.id]) : 0,
    recoverySeconds:
      strategy === "immediate" ? recoverySeconds(state, [flight.id]) : 0,
    impacts: previewImpacts(state, flight.id, target),
    blockers,
  };
}

export function previewSwap(
  state: Shift,
  primary: Flight,
  partner: Flight,
  strategy: TowStrategy,
): TowPreview {
  const a = standById(state, primary.locationId),
    b = standById(state, partner.locationId),
    buffer = findBuffer(state, partner);
  const legs: TowLeg[] =
    a && b && buffer
      ? [
          makeLeg(state, partner.id, b.id, buffer.id),
          makeLeg(state, primary.id, a.id, b.id),
          makeLeg(state, partner.id, buffer.id, a.id),
        ]
      : [];
  const blockers = swapBlockers(state, primary, partner);
  return {
    kind: "swap",
    strategy,
    primaryFlightId: primary.id,
    partnerFlightId: partner.id,
    targetId: b?.id ?? "",
    bufferId: buffer?.id,
    legs,
    lateWaitSeconds:
      strategy === "late"
        ? lateWaitSeconds(state, [primary.id, partner.id])
        : 0,
    recoverySeconds:
      strategy === "immediate"
        ? recoverySeconds(state, [primary.id, partner.id])
        : 0,
    impacts: [
      ...previewImpacts(state, primary.id, b),
      ...previewImpacts(state, partner.id, buffer),
    ],
    blockers,
  };
}

export const towStatusLabels: Record<TowPlan["status"], string> = {
  waiting: "等待目标释放",
  towing: "拖移进行中",
  done: "拖移完成",
  cancelled: "已取消",
};

export function legLabel(leg: TowLeg): string {
  return `${leg.fromId} → ${leg.toId}`;
}

export function strategyLabel(strategy: TowStrategy): string {
  return strategy === "immediate" ? "优先腾空（立即）" : "少中断（晚拖移）";
}
