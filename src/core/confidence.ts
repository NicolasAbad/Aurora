// GDD §7b: Launch Confidence, the full 8-item formula. Per the ratified checklist model
// (GDD v2.10 / SPRINTS Sprint 7): every term below that's tied to a checklist item
// (flight review, controllers, weather) only ever reaches its FULL value once that item
// is checked off — this same function also drives the LIVE preview while the checklist
// is still in progress (UI_SPEC §3: "Confidence % with tap-to-expand breakdown of every
// term"), where those terms can genuinely show 0 mid-preparation.
import type { EngineCertificationState } from './types';

const BASE = 40;
const CERTIFICATION_STANDARD = 20;
const CERTIFICATION_EXTENDED = 30;
const FLIGHT_REVIEW = 15;
const CONTROLLERS_FULLY_STAFFED = 10;
const SERVICE_TOWER = 5;
const OPTIMAL_WEATHER = 5;
const XP_PER_POINT = 50; // +1 per 50 XP
const XP_CAP = 15;

export interface ConfidenceBreakdown {
  base: number;
  certification: number;
  flightReview: number;
  controllers: number;
  serviceTower: number;
  weather: number;
  experience: number;
  total: number; // sum, capped at 100
}

export interface ConfidenceInputs {
  engineState: EngineCertificationState;
  flightReviewApproved: boolean;
  controllersFullyStaffed: boolean;
  serviceTowerBuilt: boolean;
  weatherResolved: boolean;
  flightXp: number;
}

/**
 * With extended certification, the deterministic terms alone total 40+30+15+10+5=100 —
 * "100% is reachable with zero XP, guaranteed, for every story mission" (GDD §7b),
 * Service Tower included as optional (its +5 isn't needed to reach 100 with extended
 * cert — verified in confidence.test.ts).
 */
export function computeConfidenceBreakdown(inputs: ConfidenceInputs): ConfidenceBreakdown {
  const certification = inputs.engineState.extendedCertified
    ? CERTIFICATION_EXTENDED
    : inputs.engineState.certified
      ? CERTIFICATION_STANDARD
      : 0;
  const flightReview = inputs.flightReviewApproved ? FLIGHT_REVIEW : 0;
  const controllers = inputs.controllersFullyStaffed ? CONTROLLERS_FULLY_STAFFED : 0;
  const serviceTower = inputs.serviceTowerBuilt ? SERVICE_TOWER : 0;
  const weather = inputs.weatherResolved ? OPTIMAL_WEATHER : 0;
  const experience = Math.min(XP_CAP, Math.floor(inputs.flightXp / XP_PER_POINT));
  const total = Math.min(100, BASE + certification + flightReview + controllers + serviceTower + weather + experience);

  return { base: BASE, certification, flightReview, controllers, serviceTower, weather, experience, total };
}
