import type { ServiceKind, Shift } from "../../../shared/types";
import { serviceCatalog } from "../model/catalog";
import { serviceBlockReason } from "../lib/eligibility";
import { serviceStatusLabel } from "../../tow/lib/tow";
export function ServicePanel({
  state,
  onDispatch,
}: {
  state: Shift;
  onDispatch: (kind: ServiceKind, vehicleId: string) => void;
}) {
  const tasks = state.services.filter(
    (t) => t.flightId === state.selectedFlightId,
  );
  return (
    <div className="service-panel">
      <div className="subheading">
        <h3>地勤保障</h3>
        <span>GROUND SERVICES</span>
      </div>
      {tasks.map((t, i) => {
        const info = serviceCatalog[t.kind],
          reason = serviceBlockReason(state, t.flightId, t.kind),
          available = state.vehicles.filter(
            (v) => v.kind === t.kind && v.status === "idle",
          );
        const selected =
          state.vehicles.find((v) => v.id === state.selectedVehicleId) ??
          available[0];
        const vehicle = state.vehicles.find((v) => v.id === t.vehicleId);
        return (
          <div className={`service-task ${t.status}`} key={t.id}>
            <div className="service-icon">
              {t.kind === "fuel" ? "◈" : t.kind === "baggage" ? "▤" : "✧"}
            </div>
            <div className="service-content">
              <div className="service-title">
                <strong>{info.label}</strong>
                <span>
                  {t.status === "done"
                    ? "已完成 ✓"
                    : t.status === "working"
                      ? `${Math.floor(t.progress)}%`
                      : t.status === "travel"
                        ? "车辆前往中"
                        : t.status === "paused"
                          ? "已暂停"
                          : `0${i + 1}`}
                </span>
              </div>
              <div className="service-detail">
                {t.status === "pending"
                  ? (reason ??
                    `${selected?.id ?? "暂无空闲车辆"} · ${Math.round(t.duration)}s`)
                  : t.status === "paused"
                    ? (t.pausedReason ?? "等待飞机停妥")
                    : `${t.vehicleId} · ${info.english}`}
              </div>
              {(t.status === "working" || t.status === "done") && (
                <div className="task-track">
                  <i style={{ width: `${t.progress}%` }} />
                </div>
              )}
              {t.status === "paused" && (
                <div className="task-track paused">
                  <i style={{ width: `${t.progress}%` }} />
                </div>
              )}
              {vehicle &&
                (t.status === "paused" || t.status === "working") &&
                vehicle.holdSeconds !== undefined &&
                vehicle.holdSeconds > 0 && (
                  <div className="service-detail">
                    重新连接中 · 约 {Math.ceil(vehicle.holdSeconds)}s
                  </div>
                )}
            </div>
            {t.status === "pending" && (
              <button
                className="dispatch"
                data-testid={`start-service-${t.kind}`}
                disabled={!!reason || !selected}
                title={reason ?? info.description}
                onClick={() => selected && onDispatch(t.kind, selected.id)}
              >
                派遣 ↗
              </button>
            )}
            {t.status === "paused" && (
              <span className="service-flag" title={serviceStatusLabel(t.status)}>
                ⏸
              </span>
            )}
          </div>
        );
      })}
      <p className="dependency-note">
        ↳ 先完成行李装卸，再进行客舱清洁。燃油可同步保障。拖移时：在途车辆跟随，
        正在作业的暂停或重新连接，已完成成果保留。
      </p>
    </div>
  );
}
