import { useMemo, useState } from "react";
import type { Shift, TowPreview, TowStrategy } from "../../../shared/types";
import { clockLabel } from "../../../shared/document";
import { serviceCatalog } from "../../services";
import {
  activePlan,
  findBuffer,
  flightById,
  impactLabel,
  legLabel,
  previewRelocate,
  previewSwap,
  remainingWorkSeconds,
  standById,
  strategyLabel,
  towStatusLabels,
} from "../lib/tow";

const impactClass: Record<string, string> = {
  follow: "follow",
  pause: "pause",
  reconnect: "reconnect",
  unaffected: "safe",
};

function PreviewCard({ preview }: { preview: TowPreview }) {
  const blocked = preview.blockers.length > 0;
  return (
    <div className={`tow-preview ${blocked ? "blocked" : ""}`}>
      <div className="tow-preview-head">
        <span>{preview.kind === "swap" ? "换位预览" : "拖移预览"}</span>
        <em className={blocked ? "warn" : "ok"}>
          {blocked ? "不可执行" : "可执行"}
        </em>
      </div>
      <ol className="tow-route">
        {preview.legs.length ? (
          preview.legs.map((leg, i) => (
            <li key={i}>
              {leg.flightId} · {legLabel(leg)}
              <small>{Math.round(leg.duration)}s</small>
            </li>
          ))
        ) : (
          <li>暂无可行路线</li>
        )}
      </ol>
      {preview.bufferId && (
        <p className="tow-note">
          中转位 {preview.bufferId} 为真实占用，交换不是直接互换编号。
        </p>
      )}
      {preview.waitReason && (
        <p className="tow-wait">
          ⏳ {preview.waitReason}
          {preview.waitSeconds !== undefined && ` · 约 ${preview.waitSeconds}s`}
        </p>
      )}
      <div className="tow-impacts">
        {preview.impacts.length === 0 && <span className="muted">当前没有在途作业</span>}
        {preview.impacts.map((row) => (
          <span key={`${row.flightId}-${row.kind}`} className={impactClass[row.impact]}>
            {serviceCatalog[row.kind].label}
            {row.status === "done" ? "（已完成）" : ""} ·{" "}
            {impactLabel(row.impact)}
          </span>
        ))}
      </div>
      {preview.strategy === "late" && (preview.lateWaitSeconds ?? 0) > 0 && (
        <p className="tow-cost">
          晚拖移将先让在途作业完成（约 {preview.lateWaitSeconds}s），中断更少，
          但机位腾空更晚。
        </p>
      )}
      {preview.strategy === "immediate" &&
        (preview.recoverySeconds ?? 0) > 0 && (
          <p className="tow-cost">
            立即拖移优先腾空机位，部分作业需重新连接，恢复约需{" "}
            {preview.recoverySeconds}s。
          </p>
        )}
      {blocked && (
        <ul className="tow-blockers">
          {preview.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TowPanel({
  state,
  onCreateRelocate,
  onCreateSwap,
  onCancelPlan,
}: {
  state: Shift;
  onCreateRelocate: (flightId: string, standId: string, strategy: TowStrategy) => void;
  onCreateSwap: (
    flightId: string,
    partnerId: string,
    strategy: TowStrategy,
  ) => void;
  onCancelPlan: (planId: string) => void;
}) {
  const flight = flightById(state, state.selectedFlightId);
  const [targetId, setTargetId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [strategy, setStrategy] = useState<TowStrategy>("late");
  const [mode, setMode] = useState<"relocate" | "swap">("relocate");

  const plans = state.towPlans.filter(
    (p) => p.status === "waiting" || p.status === "towing",
  );
  const closed = state.towPlans
    .filter((p) => p.status === "done" || p.status === "cancelled")
    .slice(-3)
    .reverse();

  const partners = useMemo(
    () =>
      state.flights.filter(
        (f) => f.status === "parked" && f.id !== flight?.id && f.locationId,
      ),
    [state.flights, flight?.id],
  );

  const preview = useMemo(() => {
    if (!flight) return undefined;
    if (mode === "swap") {
      const partner = partners.find((p) => p.id === partnerId);
      if (!partner) return undefined;
      return previewSwap(state, flight, partner, strategy);
    }
    if (!targetId) return undefined;
    return previewRelocate(state, flight, targetId, strategy);
  }, [state, flight, mode, partnerId, targetId, strategy, partners]);

  if (!flight) return null;
  const busy = activePlan(state, flight.id);
  const busiest = busy ?? plans.find((p) => p.partnerFlightId === flight.id);
  const buffer = findBuffer(state, flight);

  return (
    <div className="tow-panel">
      <div className="subheading">
        <h3>拖移与换位</h3>
        <span>TOW / REPOSITION</span>
      </div>

      {plans.length > 0 && (
        <div className="tow-plan-list">
          {plans.map((plan) => {
            const leg = plan.legs[plan.activeLeg];
            return (
              <div className="tow-plan-row" key={plan.id}>
                <div>
                  <strong>
                    {plan.id} · {plan.kind === "swap" ? "换位" : "拖移"}
                  </strong>
                  <span>
                    {towStatusLabels[plan.status]}
                    {plan.truckId ? ` · ${plan.truckId}` : ""}
                  </span>
                  <small>
                    {plan.legs.map((l, i) => (
                      <i
                        key={i}
                        className={
                          i < plan.activeLeg
                            ? "done"
                            : i === plan.activeLeg
                              ? "active"
                              : ""
                        }
                      >
                        {l.fromId}→{l.toId}
                      </i>
                    ))}
                  </small>
                  {plan.status === "waiting" && plan.waitReason && (
                    <em>⏳ {plan.waitReason}</em>
                  )}
                  {plan.status === "towing" && leg && (
                    <em>
                      进度 {Math.round(leg.returning ? 100 - leg.progress : leg.progress)}%
                      {plan.cancelRequested ? " · 取消中，返回原机位" : ""}
                    </em>
                  )}
                </div>
                <button
                  className="tow-cancel"
                  data-testid={`cancel-${plan.id}`}
                  onClick={() => onCancelPlan(plan.id)}
                >
                  {plan.status === "waiting" ? "取消" : "请求返回"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!busiest &&
        (flight.status === "parked" || flight.status === "towing") && (
        <>
          <div className="tow-tabs">
            <button
              className={mode === "relocate" ? "chosen" : ""}
              onClick={() => setMode("relocate")}
            >
              拖移至机位
            </button>
            <button
              className={mode === "swap" ? "chosen" : ""}
              onClick={() => setMode("swap")}
            >
              两机换位
            </button>
          </div>

          <div className="strategy-row">
            {(["late", "immediate"] as TowStrategy[]).map((option) => (
              <button
                key={option}
                className={strategy === option ? "chosen" : ""}
                data-testid={`strategy-${option}`}
                onClick={() => setStrategy(option)}
              >
                <strong>{strategyLabel(option)}</strong>
                <small>
                  {option === "late"
                    ? "少中断作业，机位腾空较晚"
                    : "优先腾空稀缺机位，承担恢复耗时"}
                </small>
              </button>
            ))}
          </div>

          {mode === "relocate" ? (
            <div className="stand-choices tow-targets">
              {state.stands
                .filter((s) => s.id !== flight.locationId)
                .map((s) => {
                  const holder = state.flights.find(
                    (f) => f.locationId === s.id && f.status !== "departed",
                  );
                  const fits = flight.size === "narrow" || s.size === "wide";
                  return (
                    <button
                      key={s.id}
                      title={
                        !fits
                          ? "机型不匹配"
                          : holder
                            ? `当前 ${holder.id} 占用`
                            : s.kind === "holding"
                              ? "临时等待位：不能开展保障"
                              : "可拖入"
                      }
                      className={`${targetId === s.id ? "chosen" : ""} ${
                        holder ? "occupied" : ""
                      } ${s.kind === "holding" ? "holding" : ""}`}
                      disabled={!fits}
                      data-testid={`tow-target-${s.id}`}
                      onClick={() => setTargetId(s.id)}
                    >
                      {s.id}
                      {s.kind === "holding" && <small>H</small>}
                    </button>
                  );
                })}
            </div>
          ) : (
            <div className="swap-choices">
              {partners.length === 0 && (
                <span className="muted">没有可交换的已停靠飞机</span>
              )}
              {partners.map((p) => (
                <button
                  key={p.id}
                  className={partnerId === p.id ? "chosen" : ""}
                  onClick={() => {
                    setPartnerId(p.id);
                    setTargetId(p.locationId ?? "");
                  }}
                >
                  {p.id}
                  <small>{p.locationId}</small>
                </button>
              ))}
              <p className="tow-note">
                {buffer
                  ? `将经 ${buffer.id} 中转：先移出对方飞机，再移动本机，最后对方进位。`
                  : "当前没有可用中转等待位，无法换位。"}
              </p>
            </div>
          )}

          {preview && <PreviewCard preview={preview} />}

          <button
            className="primary full tow-create"
            data-testid="create-tow"
            disabled={
              !preview ||
              preview.blockers.length > 0 ||
              (mode === "relocate" ? !targetId : !partnerId)
            }
            onClick={() => {
              if (!preview) return;
              if (mode === "relocate") onCreateRelocate(flight.id, targetId, strategy);
              else onCreateSwap(flight.id, partnerId, strategy);
            }}
          >
            {mode === "relocate"
              ? `创建拖移计划 · ${strategy === "late" ? "晚拖移" : "立即"}`
              : "创建换位计划"}{" "}
            <span>↗</span>
          </button>
        </>
      )}
      {!busiest &&
        flight.status !== "parked" &&
        flight.status !== "towing" && (
          <p className="tow-note">
            {flight.status === "incoming" || flight.status === "scheduled"
              ? "飞机尚未停靠，先分配机位后才能拖移或换位。"
              : flight.status === "departing"
                ? "飞机已进入离港流程，不能再拖移或换位。"
                : "本班次已结束该飞机的操作。"}
          </p>
        )}

      {flight.status === "towing" && (
        <p className="tow-note">
          飞机正在拖移途中，只存在于一个真实位置；停妥前不会恢复保障，也不能推出。
        </p>
      )}
      {flight.departureRequestedAt !== undefined &&
        flight.status !== "departing" &&
        flight.status !== "departed" && (
          <p className="tow-note warn">
            已排队离港（{clockLabel(flight.departureRequestedAt)}），须停妥且保障完成后才会推出。
          </p>
        )}
      {flight.status === "parked" &&
        remainingWorkSeconds(state, flight.id) > 0 &&
        !busiest && (
          <p className="tow-note">
            在途作业剩余约 {remainingWorkSeconds(state, flight.id)}s。
          </p>
        )}
      {closed.length > 0 && (
        <div className="tow-history">
          {closed.map((p) => (
            <span key={p.id} className={p.status}>
              {p.id} {towStatusLabels[p.status]} · {standById(state, p.toId)?.id}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
