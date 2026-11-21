export type ServiceKind = "baggage" | "fuel" | "clean";
export type FlightStatus =
  "scheduled" | "incoming" | "parked" | "towing" | "departing" | "departed";
export type ServiceStatus = "pending" | "travel" | "working" | "paused" | "done";
export type ServiceImpact =
  | "follow"
  | "pause"
  | "reconnect"
  | "unaffected"
  | "invalidate";
export type SpotKind = "contact" | "remote" | "holding";
export interface Point {
  x: number;
  y: number;
}
export interface Flight {
  id: string;
  airline: string;
  from: string;
  destination: string;
  aircraft: string;
  size: "narrow" | "wide";
  arrival: number;
  deadline: number;
  passengers: number;
  status: FlightStatus;
  /**
   * The single stable spot the aircraft currently occupies. It is undefined
   * while the aircraft is between spots (towing) or still airborne.
   */
  locationId?: string;
  /** Present only while this aircraft is being towed. */
  towPlanId?: string;
  /** Set when a pushback clearance arrives before the aircraft is safe. */
  departureRequestedAt?: number;
  departureAt?: number;
  color: string;
}
export interface Stand extends Point {
  id: string;
  size: "narrow" | "wide";
  terminal: string;
  kind: SpotKind;
  /** Holding spots are real positions but cannot run ground services. */
  serviceCapable: boolean;
  towable: boolean;
}
export interface Service {
  id: string;
  flightId: string;
  kind: ServiceKind;
  status: ServiceStatus;
  progress: number;
  duration: number;
  vehicleId?: string;
  pausedReason?: string;
  /** Remaining hook-up / reconnection time before work can resume. */
  resumeDelay?: number;
  /** How this job reacted to the last tow (used to resume correctly). */
  towImpact?: ServiceImpact;
  /** Status to restore after the aircraft is safely parked again. */
  resumeAs?: "travel" | "working";
}
export interface Vehicle {
  id: string;
  kind: ServiceKind;
  status:
    | "idle"
    | "travel"
    | "working"
    | "relocating"
    | "paused"
    | "returning";
  /** Remaining seconds before a paused vehicle can resume at the new spot. */
  holdSeconds?: number;
  position: Point;
  origin: Point;
  target: Point;
  progress: number;
  tripDuration: number;
  serviceId?: string;
}
export type TowStrategy = "immediate" | "late";
export type TowPlanKind = "relocate" | "swap";
export type TowPlanStatus = "waiting" | "towing" | "done" | "cancelled";
export type TowLegStatus = "pending" | "active" | "done";
export interface TowLeg {
  flightId: string;
  fromId: string;
  toId: string;
  status: TowLegStatus;
  /** Tow travel progress, 0-100. */
  progress: number;
  /** Tow travel duration in simulated seconds. */
  duration: number;
  /** Tractor approach to the aircraft before the leg can start. */
  approachProgress: number;
  approachDuration: number;
  /** Where the tractor started its approach; needed for smooth routing. */
  approachOrigin: Point;
  /** True once the tractor is hitched and the aircraft has left its spot. */
  hooked?: boolean;
  /** Set when a mid-tow cancellation sends the aircraft back to its origin. */
  returning?: boolean;
}
export interface TowPlan {
  id: string;
  kind: TowPlanKind;
  status: TowPlanStatus;
  strategy: TowStrategy;
  flightId: string;
  toId: string;
  partnerFlightId?: string;
  /** The holding spot used as a real intermediate position for a swap. */
  bufferId?: string;
  legs: TowLeg[];
  activeLeg: number;
  /** The spot each aircraft started from, used for safe cancellations. */
  origins: { flightId: string; standId: string }[];
  createdAt: number;
  startedAt?: number;
  waitReason?: string;
  truckId?: string;
  cancelRequested?: boolean;
}
export interface TowTractor {
  id: string;
  status: "idle" | "towing" | "returning";
  position: Point;
  origin: Point;
  target: Point;
  progress: number;
  tripDuration: number;
  planId?: string;
}
export interface TowImpact {
  flightId: string;
  kind: ServiceKind;
  status: ServiceStatus;
  impact: ServiceImpact;
}
export interface TowPreview {
  kind: TowPlanKind;
  strategy: TowStrategy;
  primaryFlightId: string;
  partnerFlightId?: string;
  targetId: string;
  bufferId?: string;
  legs: TowLeg[];
  waitReason?: string;
  waitSeconds?: number;
  /** How long a late tow will wait for in-progress work to finish. */
  lateWaitSeconds?: number;
  /** Extra time an immediate tow costs before work can resume. */
  recoverySeconds?: number;
  impacts: TowImpact[];
  blockers: string[];
}
export interface Event {
  id: number;
  time: number;
  text: string;
  tone: "info" | "success" | "warning";
}
export interface Shift {
  version: 2;
  time: number;
  paused: boolean;
  speed: 1 | 2 | 4;
  score: number;
  conflicts: number;
  flights: Flight[];
  stands: Stand[];
  services: Service[];
  vehicles: Vehicle[];
  towPlans: TowPlan[];
  towTractors: TowTractor[];
  events: Event[];
  selectedFlightId: string;
  selectedStandId?: string;
  selectedVehicleId?: string;
  nextEventId: number;
  nextPlanId: number;
}
export type CommandResult = (state: Shift) => Shift;
