import type { Shift } from "../../../shared/types";
import { compatibleStand, occupiedFlight } from "../lib/geometry";
import { planOccupiesSpot } from "../../tow/lib/tow";
export function StandPicker({
  state,
  onAssign,
  onSelect,
}: {
  state: Shift;
  onAssign: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const f = state.flights.find((x) => x.id === state.selectedFlightId);
  if (!f || f.status !== "incoming") return null;
  const valid = state.stands.find((s) => s.id === state.selectedStandId);
  const reserved = state.towPlans.some(
    (p) =>
      (p.status === "waiting" || p.status === "towing") &&
      state.selectedStandId !== undefined &&
      planOccupiesSpot(p, state.selectedStandId),
  );
  return (
    <div className="stand-picker">
      <div className="hint-label">01 / 为航班分配机位</div>
      <div className="stand-choices">
        {state.stands.map((s) => {
          const holder = occupiedFlight(state, s.id);
          const usable = s.serviceCapable;
          return (
            <button
              key={s.id}
              disabled={
                !!holder || !compatibleStand(s, f) || !usable || reserved
              }
              title={
                !usable ? "临时等待位不能作为进港停靠位" : holder ? `${holder.id} 占用` : ""
              }
              className={`${s.id === state.selectedStandId ? "chosen" : ""} ${
                s.kind === "holding" ? "holding" : ""
              }`}
              onClick={() => onSelect(s.id)}
            >
              {s.id}
              {s.size === "wide" && <small>W</small>}
            </button>
          );
        })}
      </div>
      <button
        className="primary full"
        data-testid="assign-stand"
        disabled={
          !valid ||
          !!occupiedFlight(state, valid.id) ||
          !compatibleStand(valid, f) ||
          !valid.serviceCapable ||
          reserved
        }
        onClick={() => valid && onAssign(valid.id)}
      >
        分配至 {valid?.id ?? "所选机位"} <span>↗</span>
      </button>
    </div>
  );
}
