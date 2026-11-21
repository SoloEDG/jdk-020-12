import type { Shift } from "../../../shared/types";
const kinds = ["fuel", "baggage", "clean"];
const flightStates = [
  "scheduled",
  "incoming",
  "parked",
  "towing",
  "departing",
  "departed",
];
const serviceStates = ["pending", "travel", "working", "paused", "done"];
const vehicleStates = [
  "idle",
  "travel",
  "working",
  "relocating",
  "paused",
  "returning",
];
const impacts = [
  "follow",
  "pause",
  "reconnect",
  "unaffected",
  "invalidate",
];
const tractorStates = ["idle", "towing", "returning"];
const planStates = ["waiting", "towing", "done", "cancelled"];
const legStates = ["pending", "active", "done"];
const spotKinds = ["contact", "remote", "holding"];
type Row = Record<string, unknown>;
function row(value: unknown): value is Row {
  return typeof value === "object" && value !== null;
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function point(value: unknown): boolean {
  return row(value) && finite(value.x) && finite(value.y);
}
function unique(values: Row[]): boolean {
  return (
    values.every((x) => text(x.id)) &&
    new Set(values.map((x) => x.id)).size === values.length
  );
}
function collection(value: unknown, length: number): value is Row[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every(row) &&
    unique(value)
  );
}
export function validShift(value: unknown): value is Shift {
  if (
    !row(value) ||
    value.version !== 2 ||
    !finite(value.time) ||
    value.time < 0 ||
    !finite(value.score) ||
    !finite(value.conflicts) ||
    value.conflicts < 0 ||
    typeof value.paused !== "boolean" ||
    ![1, 2, 4].includes(value.speed as number) ||
    !finite(value.nextEventId) ||
    !finite(value.nextPlanId)
  )
    return false;
  if (
    !collection(value.flights, 6) ||
    !collection(value.stands, 8) ||
    !collection(value.vehicles, 6) ||
    !collection(value.services, 18) ||
    !collection(value.towTractors, 2) ||
    !Array.isArray(value.towPlans) ||
    value.towPlans.length > 12 ||
    !Array.isArray(value.events) ||
    value.events.length > 30
  )
    return false;
  const flights = value.flights,
    stands = value.stands,
    vehicles = value.vehicles,
    services = value.services,
    tractors = value.towTractors,
    plans = value.towPlans as Row[];
  const flightIds = new Set(flights.map((x) => x.id)),
    standIds = new Set(stands.map((x) => x.id)),
    vehicleIds = new Set(vehicles.map((x) => x.id)),
    serviceIds = new Set(services.map((x) => x.id)),
    tractorIds = new Set(tractors.map((x) => x.id)),
    planIds = new Set(plans.map((x) => x.id));

  if (
    !flights.every(
      (f) =>
        text(f.airline) &&
        text(f.from) &&
        text(f.destination) &&
        text(f.aircraft) &&
        ["narrow", "wide"].includes(f.size as string) &&
        flightStates.includes(f.status as string) &&
        finite(f.arrival) &&
        finite(f.deadline) &&
        finite(f.passengers) &&
        f.passengers > 0 &&
        text(f.color) &&
        (f.departureAt === undefined || finite(f.departureAt)) &&
        (f.departureRequestedAt === undefined ||
          finite(f.departureRequestedAt)) &&
        (f.locationId === undefined || standIds.has(f.locationId)) &&
        (f.towPlanId === undefined || planIds.has(f.towPlanId)),
    )
  )
    return false;
  if (
    !stands.every(
      (s) =>
        point(s) &&
        ["narrow", "wide"].includes(s.size as string) &&
        spotKinds.includes(s.kind as string) &&
        text(s.terminal) &&
        typeof s.serviceCapable === "boolean" &&
        typeof s.towable === "boolean",
    )
  )
    return false;
  if (
    !vehicles.every(
      (v) =>
        kinds.includes(v.kind as string) &&
        vehicleStates.includes(v.status as string) &&
        point(v.position) &&
        point(v.origin) &&
        point(v.target) &&
        finite(v.progress) &&
        v.progress >= 0 &&
        v.progress <= 100 &&
        finite(v.tripDuration) &&
        v.tripDuration > 0 &&
        (v.holdSeconds === undefined || finite(v.holdSeconds)) &&
        (v.serviceId === undefined || serviceIds.has(v.serviceId)),
    )
  )
    return false;
  if (
    !tractors.every(
      (t) =>
        tractorStates.includes(t.status as string) &&
        point(t.position) &&
        point(t.origin) &&
        point(t.target) &&
        finite(t.progress) &&
        t.progress >= 0 &&
        t.progress <= 100 &&
        finite(t.tripDuration) &&
        t.tripDuration > 0 &&
        (t.planId === undefined || planIds.has(t.planId)),
    )
  )
    return false;
  if (
    !services.every(
      (s) =>
        flightIds.has(s.flightId) &&
        kinds.includes(s.kind as string) &&
        serviceStates.includes(s.status as string) &&
        finite(s.progress) &&
        s.progress >= 0 &&
        s.progress <= 100 &&
        finite(s.duration) &&
        s.duration > 0 &&
        (s.vehicleId === undefined || vehicleIds.has(s.vehicleId)) &&
        (s.towImpact === undefined || impacts.includes(s.towImpact as string)) &&
        (s.resumeDelay === undefined || finite(s.resumeDelay)),
    )
  )
    return false;
  if (
    !plans.every((p) => {
      if (
        !text(p.id) ||
        !["relocate", "swap"].includes(p.kind as string) ||
        !planStates.includes(p.status as string) ||
        !["immediate", "late"].includes(p.strategy as string) ||
        !flightIds.has(p.flightId) ||
        !standIds.has(p.toId) ||
        !Array.isArray(p.legs) ||
        p.legs.length === 0 ||
        !finite(p.activeLeg) ||
        p.activeLeg < 0 ||
        p.activeLeg >= p.legs.length ||
        !Array.isArray(p.origins) ||
        (p.partnerFlightId !== undefined && !flightIds.has(p.partnerFlightId)) ||
        (p.bufferId !== undefined && !standIds.has(p.bufferId)) ||
        (p.truckId !== undefined && !tractorIds.has(p.truckId))
      )
        return false;
      return (p.legs as Row[]).every(
        (leg) =>
          flightIds.has(leg.flightId) &&
          standIds.has(leg.fromId) &&
          standIds.has(leg.toId) &&
          legStates.includes(leg.status as string) &&
          finite(leg.progress) &&
          leg.progress >= 0 &&
          leg.progress <= 100 &&
          finite(leg.duration) &&
          leg.duration > 0 &&
          point(leg.approachOrigin),
      );
    })
  )
    return false;

  // Every aircraft must be in exactly one real place; a towing aircraft has
  // no location until it is chocked again.
  const located = flights.filter(
    (f) => f.locationId !== undefined && f.status !== "departed",
  );
  if (
    new Set(located.map((f) => f.locationId)).size !== located.length ||
    !flights.every(
      (f) =>
        !["parked", "departing"].includes(f.status as string) ||
        (standIds.has(f.locationId) &&
          (f.size === "narrow" ||
            stands.find((s) => s.id === f.locationId)?.size === "wide")),
    ) ||
    !flights.every(
      (f) =>
        f.status !== "towing" ||
        (f.locationId === undefined &&
          f.towPlanId !== undefined &&
          plans.some(
            (p) => p.id === f.towPlanId && p.status === "towing",
          )),
    )
  )
    return false;

  if (
    !services.every((s) => {
      if (s.status === "pending")
        return s.progress === 0 && s.vehicleId === undefined;
      const v = vehicles.find((x) => x.id === s.vehicleId);
      if (!v || v.kind !== s.kind) return false;
      if (s.status === "done") return s.progress === 100;
      if (s.status === "paused") return v.serviceId === s.id;
      const flightStatus = flights.find((f) => f.id === s.flightId)?.status;
      // A vehicle may be en route while the aircraft is being towed: it is
      // driving toward the aircraft's real (new) position, or waiting there
      // for the aircraft to be chocked.
      if (s.status === "travel")
        return (
          v.serviceId === s.id &&
          !["idle", "returning"].includes(v.status as string) &&
          !["departing", "departed"].includes(flightStatus as string)
        );
      return (
        v.serviceId === s.id &&
        v.status === "working" &&
        flightStatus === "parked"
      );
    })
  )
    return false;
  if (
    !vehicles.every(
      (v) =>
        !["travel", "working"].includes(v.status as string) ||
        services.some(
          (s) =>
            s.id === v.serviceId &&
            s.vehicleId === v.id &&
            s.status === v.status,
        ),
    )
  )
    return false;
  if (
    !flights.every(
      (f) =>
        services.filter(
          (t) =>
            t.flightId === f.id &&
            ["travel", "working", "paused"].includes(t.status as string),
        ).length <= 2,
    )
  )
    return false;
  if (
    !flights.every(
      (f) =>
        !["departing", "departed"].includes(f.status as string) ||
        services
          .filter((t) => t.flightId === f.id)
          .every((t) => t.status === "done"),
    )
  )
    return false;
  if (
    !value.events.every(
      (e) =>
        row(e) &&
        finite(e.id) &&
        finite(e.time) &&
        text(e.text) &&
        ["info", "success", "warning"].includes(e.tone as string),
    )
  )
    return false;
  const events = value.events as Row[];
  if (
    new Set(events.map((e) => e.id)).size !== events.length ||
    events.some((e) => (e.id as number) >= (value.nextEventId as number))
  )
    return false;
  return (
    flightIds.has(value.selectedFlightId) &&
    (value.selectedStandId === undefined ||
      standIds.has(value.selectedStandId)) &&
    (value.selectedVehicleId === undefined ||
      vehicleIds.has(value.selectedVehicleId))
  );
}
