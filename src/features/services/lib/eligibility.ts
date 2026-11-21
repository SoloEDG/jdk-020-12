import type { Shift, ServiceKind } from "../../../shared/types";
import { serviceCatalog } from "../model/catalog";
export function serviceStand(state: Shift, flightId: string) {
  const flight = state.flights.find((f) => f.id === flightId);
  return state.stands.find((s) => s.id === flight?.locationId);
}
export function serviceBlockReason(
  s: Shift,
  flightId: string,
  kind: ServiceKind,
): string | undefined {
  const f = s.flights.find((x) => x.id === flightId),
    task = s.services.find((x) => x.flightId === flightId && x.kind === kind),
    stand = s.stands.find((x) => x.id === f?.locationId);
  // Work may only (re)start once the aircraft is safely chocked at a real,
  // service-capable spot. A queued clearance does not by itself stop work:
  // finishing the job is what lets the queued pushback happen.
  if (!f || f.status !== "parked") return "请先分配机位并停妥";
  if (!stand) return "飞机位置未知";
  if (!stand.serviceCapable) return "临时等待位无法开展保障";
  if (!task || task.status !== "pending") return "任务已派遣";
  if (
    serviceCatalog[kind].requires.some(
      (k) =>
        !s.services.some(
          (t) => t.flightId === flightId && t.kind === k && t.status === "done",
        ),
    )
  )
    return "等待行李装卸完成";
  const active = s.services.filter(
    (t) =>
      t.flightId === flightId &&
      (t.status === "travel" ||
        t.status === "working" ||
        t.status === "paused"),
  ).length;
  if (active >= 2) return "机位的两个服务位均已占用";
  return undefined;
}
