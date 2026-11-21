import type { Shift } from "../../../shared/types";
import { compatibleStand, occupiedFlight } from "../lib/geometry";
import { towingPosition } from "../../tow/model/engine";
import { planOccupiesSpot } from "../../tow/lib/tow";
import { Aircraft } from "./Aircraft";

interface Props {
  state: Shift;
  onStand: (id: string) => void;
  onFlight: (id: string) => void;
}

function standPoint(state: Shift, id?: string) {
  return state.stands.find((s) => s.id === id);
}

export function ApronMap({ state, onStand, onFlight }: Props) {
  const selected = state.flights.find((f) => f.id === state.selectedFlightId);
  const towPlans = state.towPlans.filter((p) => p.status === "towing");
  return (
    <section className="map-shell">
      <div className="map-toolbar">
        <div>
          <span className="live-dot" />
          实时机坪 <span className="toolbar-en">APRON OVERVIEW</span>
        </div>
        <div className="weather">
          ↗ 240° / 06 KT <span>☀ 24°C</span>
        </div>
      </div>
      <svg
        viewBox="0 0 940 660"
        className="apron-svg"
        aria-label="交互机场机坪地图"
      >
        <defs>
          <pattern
            id="concrete"
            width="80"
            height="80"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M80 0H0V80"
              fill="none"
              stroke="#b7bcad"
              strokeWidth=".7"
            />
          </pattern>
          <pattern
            id="grass"
            width="13"
            height="13"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="3" cy="4" r=".8" fill="#a1aa8c" />
          </pattern>
          <filter id="shadow">
            <feDropShadow dx="0" dy="6" stdDeviation="6" floodOpacity=".13" />
          </filter>
        </defs>
        <rect width="940" height="660" fill="#c9cebd" />
        <rect width="940" height="660" fill="url(#grass)" />
        <path d="M0 140H940V565H0Z" fill="#d5d6c9" />
        <path d="M0 140H940V565H0Z" fill="url(#concrete)" />
        <path d="M0 355H940" stroke="#aab0a5" strokeWidth="64" />
        <path
          d="M0 355H940"
          stroke="#e7d48e"
          strokeWidth="2"
          strokeDasharray="14 10"
        />
        <path d="M0 606H940" stroke="#858f87" strokeWidth="65" />
        <path
          d="M0 606H940"
          stroke="#eeeade"
          strokeWidth="2"
          strokeDasharray="25 16"
        />
        <text x="45" y="612" className="runway-label">
          ← TAXIWAY A
        </text>
        <path
          d="M75 355V605M740 355V605"
          stroke="#e6cd79"
          strokeWidth="2"
          fill="none"
        />
        <path d="M150 118H730V144H150Z" fill="#949f99" />
        <rect
          x="120"
          y="35"
          width="640"
          height="86"
          rx="5"
          fill="#f0eee3"
          filter="url(#shadow)"
        />
        <path d="M130 105H750" stroke="#b0c0be" strokeWidth="20" />
        <path
          d="M130 105H750"
          stroke="#d9e4df"
          strokeWidth="12"
          strokeDasharray="25 4"
        />
        <text x="155" y="77" className="terminal-label">
          TERMINAL 01
        </text>
        <text x="634" y="77" className="terminal-sub">
          国内出发
        </text>
        {[220, 420, 650].map((x) => (
          <g key={x}>
            <path
              d={`M${x - 36} 119V155L${x - 9} 173`}
              stroke="#a8b3ab"
              strokeWidth="12"
              fill="none"
            />
            <path
              d={`M${x - 36} 119V155L${x - 9} 173`}
              stroke="#e9e8dc"
              strokeWidth="8"
              fill="none"
            />
          </g>
        ))}

        {towPlans.map((plan) =>
          plan.legs.map((leg, i) => {
            const from = standPoint(state, leg.fromId);
            const to = standPoint(state, leg.toId);
            if (!from || !to) return null;
            const active = i === plan.activeLeg;
            return (
              <line
                key={`${plan.id}-${i}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={active ? "#cf7b3c" : "#aab4a8"}
                strokeWidth={active ? 2 : 1}
                strokeDasharray={active ? "7 6" : "3 7"}
                opacity={active ? 0.9 : 0.45}
              />
            );
          }),
        )}

        {state.stands.map((stand) => {
          const f = occupiedFlight(state, stand.id),
            active = state.selectedStandId === stand.id;
          const compatible = selected && compatibleStand(stand, selected);
          const pending = state.towPlans.find(
            (p) =>
              (p.status === "waiting" || p.status === "towing") &&
              planOccupiesSpot(p, stand.id),
          );
          return (
            <g
              key={stand.id}
              className="stand-group"
              role="button"
              tabIndex={0}
              aria-label={`机位 ${stand.id}`}
              data-testid={`stand-${stand.id}`}
              onClick={() => {
                onStand(stand.id);
                if (f) onFlight(f.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onStand(stand.id);
              }}
            >
              <rect
                x={stand.x - 82}
                y={stand.y - 80}
                width="164"
                height="155"
                rx="11"
                fill={
                  active
                    ? "#efc78c"
                    : f
                      ? "#c3ccbf"
                      : stand.kind === "holding"
                        ? "#cad4d6"
                        : "#cfd3c4"
                }
                fillOpacity={active ? 0.42 : 0.25}
                stroke={active ? "#cf7b3c" : f ? "#99ac9c" : "#b2b9a7"}
                strokeWidth={active ? 2 : 1}
                strokeDasharray={f ? undefined : "5 5"}
              />
              <path
                d={`M${stand.x} ${stand.y + 79}V${stand.y - 48}M${stand.x - 15} ${stand.y - 48}H${stand.x + 15}`}
                fill="none"
                stroke="#e9c76a"
                strokeWidth="2"
              />
              {f ? null : (
                <text
                  x={stand.x}
                  y={stand.y}
                  textAnchor="middle"
                  className="stand-empty"
                >
                  ＋
                </text>
              )}
              <rect
                x={stand.x - 31}
                y={stand.y + 85}
                width="62"
                height="24"
                rx="4"
                fill={active ? "#293f46" : "#e9e7d9"}
              />
              <text
                x={stand.x}
                y={stand.y + 101}
                textAnchor="middle"
                fill={active ? "#fff" : "#546356"}
                className="stand-label"
              >
                {stand.id} {stand.size === "wide" ? "W" : ""}
              </text>
              {stand.kind === "holding" && (
                <text
                  x={stand.x}
                  y={stand.y - 55}
                  textAnchor="middle"
                  className="holding-label"
                >
                  等待位
                </text>
              )}
              {f && (
                <text
                  x={stand.x}
                  y={stand.y + 126}
                  textAnchor="middle"
                  className="plane-label"
                >
                  {f.id}
                </text>
              )}
              {pending && (
                <text
                  x={stand.x}
                  y={stand.y - 62}
                  textAnchor="middle"
                  className="plan-label"
                >
                  {pending.status === "waiting" ? "已预留" : "拖入中"}
                </text>
              )}
              {!f && selected?.status === "incoming" && compatible && (
                <circle
                  cx={stand.x + 67}
                  cy={stand.y - 65}
                  r="4"
                  fill="#639b84"
                />
              )}
            </g>
          );
        })}

        {state.flights.map((f) => {
          if (f.status === "departed" || f.status === "scheduled") return null;
          if (f.locationId) {
            const stand = standPoint(state, f.locationId);
            if (!stand) return null;
            return (
              <g
                key={f.id}
                className="map-plane"
                onClick={() => onFlight(f.id)}
              >
                <Aircraft
                  x={stand.x}
                  y={stand.y - 2}
                  color={f.color}
                  wide={f.size === "wide"}
                  departing={f.status === "departing"}
                />
              </g>
            );
          }
          const moving = towingPosition(state, f.id);
          if (!moving) return null;
          return (
            <g
              key={f.id}
              className="map-plane towing-plane"
              onClick={() => onFlight(f.id)}
            >
              <Aircraft
                x={moving.x}
                y={moving.y}
                color={f.color}
                wide={f.size === "wide"}
              />
              <text
                x={moving.x}
                y={moving.y + 145}
                textAnchor="middle"
                className="plane-label"
              >
                {f.id} 拖移中
              </text>
            </g>
          );
        })}

        <rect
          x="780"
          y="387"
          width="131"
          height="161"
          rx="5"
          fill="#bfC5b5"
          stroke="#a7af9d"
        />
        <text x="795" y="411" className="depot-label">
          GSE STATION
        </text>
        {[0, 1, 2].map((n) => (
          <path
            key={n}
            d={`M792 ${441 + n * 32}H897`}
            stroke="#e8e4d2"
            strokeWidth="1"
          />
        ))}
        {state.vehicles.map((v) => (
          <g
            key={v.id}
            transform={`translate(${v.position.x} ${v.position.y})`}
            className="vehicle-marker"
          >
            <rect
              x="-10"
              y="-6"
              width="22"
              height="13"
              rx="3"
              fill={
                v.kind === "fuel"
                  ? "#dda24d"
                  : v.kind === "baggage"
                    ? "#4b9392"
                    : "#798cab"
              }
              stroke="#f3f0df"
              strokeWidth="1.5"
            />
            <rect x="6" y="-4" width="4" height="8" rx="1" fill="#e5e9df" />
            <circle cx="-5" cy="7" r="2" fill="#3a4644" />
            <circle cx="7" cy="7" r="2" fill="#3a4644" />
            {v.status === "travel" && (
              <circle
                r="18"
                fill="none"
                stroke="#fff"
                strokeOpacity=".5"
                className="moving-ring"
              />
            )}
          </g>
        ))}
        {state.towTractors.map((t) => (
          <g
            key={t.id}
            transform={`translate(${t.position.x} ${t.position.y})`}
            className={`tractor-marker ${t.status}`}
            data-testid={`tractor-marker-${t.id}`}
          >
            <rect
              x="-9"
              y="-6"
              width="18"
              height="12"
              rx="2"
              fill="#3f5b58"
              stroke="#f4eeda"
              strokeWidth="1.4"
            />
            <circle cx="-4" cy="-5" r="1.6" fill="#f0e4c6" />
            <circle cx="4" cy="-5" r="1.6" fill="#f0e4c6" />
          </g>
        ))}
        <g transform="translate(880 60)">
          <circle r="25" fill="#f3f1e8" fillOpacity=".8" />
          <path d="M0 -17L6 10L0 5L-6 10Z" fill="#334d50" />
          <text y="-32" textAnchor="middle" className="compass">
            N
          </text>
        </g>
        <text
          x="37"
          y="520"
          transform="rotate(-90 37 520)"
          className="map-side-label"
        >
          APRON 07 / EAST FIELD
        </text>
      </svg>
      <div className="map-legend">
        <span>
          <i className="legend-idle" />
          空闲机位
        </span>
        <span>
          <i className="legend-occupied" />
          保障中
        </span>
        <span>
          <i className="legend-holding" />
          临时等待位
        </span>
        <span>
          <i className="legend-selected" />
          当前选择
        </span>
        <span className="map-scale">0 ━━━━━ 100 m</span>
      </div>
    </section>
  );
}
