import type { Shift } from "../../../shared/types";
import { initialFlights } from "../../flights/model/schedule";
import { initialStands } from "../../apron/model/stands";
import { initialServices } from "../../services/model/catalog";
import { initialVehicles } from "../../fleet/model/vehicles";
import { initialTowTractors } from "../../tow/model/tractors";
export function createShift(): Shift {
  const flights = initialFlights();
  return {
    version: 2,
    time: 0,
    paused: false,
    speed: 1,
    score: 0,
    conflicts: 0,
    flights,
    stands: initialStands(),
    services: initialServices(flights),
    vehicles: initialVehicles(),
    towPlans: [],
    towTractors: initialTowTractors(),
    events: [
      { id: 0, time: 0, text: "早班开始 · 3 架航班等待机位分配", tone: "info" },
    ],
    selectedFlightId: "MU2451",
    nextEventId: 1,
    nextPlanId: 1,
  };
}
