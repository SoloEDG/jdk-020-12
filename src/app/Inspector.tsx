import type { ServiceKind, Shift, TowStrategy } from "../shared/types";
import { clockLabel } from "../shared/document";
import {
  flightReady,
  departFlight,
  cancelDepartureRequest,
  statusLabels,
} from "../features/flights";
import { occupiedFlight, standById, StandPicker } from "../features/apron";
import { ServicePanel } from "../features/services";
import { EventLog } from "../features/session";
import { TowPanel, activePlan, planLegFor, towStatusLabels } from "../features/tow";
export function Inspector({
  state,
  onChange,
  onStand,
  onAssign,
  onDispatch,
  onRelocate,
  onSwap,
  onCancelPlan,
}: {
  state: Shift;
  onChange: (s: Shift) => void;
  onStand: (id: string) => void;
  onAssign: (id: string) => void;
  onDispatch: (k: ServiceKind, v: string) => void;
  onRelocate: (flightId: string, standId: string, strategy: TowStrategy) => void;
  onSwap: (flightId: string, partnerId: string, strategy: TowStrategy) => void;
  onCancelPlan: (planId: string) => void;
}) {
  const f = state.flights.find((x) => x.id === state.selectedFlightId)!;
  const stand = standById(state, f.locationId);
  const plan = activePlan(state, f.id);
  const legInfo = planLegFor(state, f.id);
  const busyLeg = legInfo?.leg;
  const canDepart =
    f.status === "parked" && flightReady(state, f.id) && !plan;
  return (
    <aside className="inspector">
      <div className="inspector-heading">
        <span className="eyebrow">TURNAROUND CONTROL</span>
        <span className="dot-menu">•••</span>
      </div>
      <div className="selected-flight">
        <span className="airline-mark" style={{ background: f.color }}>
          ✈
        </span>
        <div>
          <h2>{f.id}</h2>
          <p>
            {f.airline} · {f.aircraft}
          </p>
        </div>
        <span className="flight-chip">
          {f.locationId ?? (f.status === "towing" ? "拖移中" : "待分配")}
        </span>
      </div>
      <div className="route-detail">
        <strong>{f.from.split(" · ")[1]}</strong>
        <span>──────── ✈ ────────</span>
        <strong>{f.destination.split(" · ")[1]}</strong>
      </div>
      <div className="departure-info">
        <span>
          计划离港 <b>{clockLabel(f.deadline)}</b>
        </span>
        <span
          className={
            state.time > f.deadline || f.departureRequestedAt !== undefined
              ? "warning-text"
              : ""
          }
        >
          {statusLabels[f.status]}
        </span>
      </div>
      <StandPicker state={state} onAssign={onAssign} onSelect={onStand} />

      {plan && (
        <div className="tow-banner" data-testid="active-tow">
          <div>
            <strong>
              {plan.id} · {plan.kind === "swap" ? "换位" : "拖移"}
            </strong>
            <span>{towStatusLabels[plan.status]}</span>
          </div>
          <p>
            {plan.status === "waiting"
              ? plan.waitReason ?? `${plan.toId} 释放后自动开始`
              : busyLeg
                ? `${busyLeg.fromId} → ${busyLeg.toId} · ${
                    busyLeg.returning
                      ? "返回原机位中"
                      : busyLeg.hooked
                        ? "拖行中"
                        : "拖车接近中"
                  }`
                : "准备下一段"}
          </p>
          {f.status === "towing" && (
            <small>
              唯一真实位置：拖移途中。停妥前不恢复保障，也不能推出。
            </small>
          )}
        </div>
      )}

      {f.status !== "incoming" &&
        f.status !== "scheduled" &&
        f.status !== "towing" &&
        stand && (
          <div className="stand-occupancy">
            <span>
              机位 {stand.id} ·{" "}
              {stand.serviceCapable ? "服务位" : "临时等待位"}
            </span>
            <b>
              {
                state.services.filter(
                  (t) =>
                    t.flightId === f.id &&
                    (t.status === "travel" ||
                      t.status === "working" ||
                      t.status === "paused"),
                ).length
              }{" "}
              / 2 占用
            </b>
          </div>
        )}
      {f.status === "incoming" && state.selectedStandId && (
        <p className="tow-note">
          目标 {state.selectedStandId}
          {occupiedFlight(state, state.selectedStandId)
            ? ` 当前由 ${occupiedFlight(state, state.selectedStandId)?.id} 占用`
            : " 空闲"}
        </p>
      )}
      <ServicePanel state={state} onDispatch={onDispatch} />
      <TowPanel
        state={state}
        onCreateRelocate={onRelocate}
        onCreateSwap={onSwap}
        onCancelPlan={onCancelPlan}
      />
      {f.departureRequestedAt !== undefined &&
        f.status !== "departing" &&
        f.status !== "departed" && (
          <button
            className="secondary full"
            data-testid="cancel-departure"
            onClick={() => onChange(cancelDepartureRequest(state, f.id))}
          >
            取消离港排队
          </button>
        )}
      <button
        className="primary depart-button"
        data-testid="depart"
        disabled={!canDepart}
        onClick={() => onChange(departFlight(state, f.id))}
      >
        {f.status === "departed"
          ? "已完成离港"
          : f.status === "departing"
            ? "飞机正在推出…"
            : f.status === "towing"
              ? "拖移中 · 停妥后方可推出"
              : f.departureRequestedAt !== undefined
                ? "离港指令排队中"
                : "批准推出离港"}{" "}
        <span>→</span>
      </button>
      <EventLog state={state} />
    </aside>
  );
}
