import type { AuctionWeights, InterventionKind } from "@/lib/schemas/simulation";
import type { ScoreComponentKey } from "@/lib/schemas/evidence";

/** Every tunable coefficient of the engine lives here. Nothing else hard-codes a model number. */
export const CONFIG = {
  /** Calendar position of the scenario clock, for new history rows. */
  clock: { year: 2026, month: 10 },

  flood: {
    /** Base risk = weighted sum of the cell's flood factors (sums to 1). */
    weights: {
      rainfallPressure: 0.25,
      upstreamPressure: 0.25,
      drainageFailure: 0.2,
      elevationSusceptibility: 0.1,
      historicSusceptibility: 0.08,
      incidentPressure: 0.07,
      evidenceConfidence: 0.05,
    },
    /** Minutes per propagation step. */
    stepMin: 5,
    /** Pressure above this spills to lower neighbours. */
    flowThreshold: 0.43,
    /** Share of the excess that moves downhill per step. */
    flowRate: 0.35,
    /** Share of the spilled water that actually leaves the source cell (rain keeps refilling the rest). */
    flowLoss: 0.8,
    /** Per-step decay of the spill (time/distance attenuation). */
    flowDecay: 0.9,
    /** Extra inflow per additional uphill cell feeding the same cell. */
    convergenceBoost: 0.08,
    /** Share of inflow a fully working drain removes. */
    drainRelief: 0.45,
    /** Per-step ponding where rain falls on a failed drain. */
    rainAccum: 0.01,
    maxPressure: 1.2,
    /** Exposure curve: share of population = maxShare * ((risk - floor) / (100 - floor)) ^ gamma. */
    exposureRiskFloor: 47,
    exposureMaxShare: 0.6,
    exposureGamma: 1.4,
    /** A facility is "at risk" when its cell flood risk reaches this. */
    facilityRiskThreshold: 60,
    /** Risk points of change that count as rising/falling. */
    trendDelta: 3,
    contributorsShown: 5,
  },

  scarcity: {
    /** Risk = weighted sum (supply and storage inverted; sums to 1). */
    weights: {
      supplyAvailability: 0.22,
      demandPressure: 0.14,
      heatStress: 0.1,
      pipelineFailure: 0.18,
      outageReports: 0.1,
      storageAvailability: 0.12,
      populationPressure: 0.06,
      criticalFacilityDemand: 0.08,
    },
    litersPerCapitaDay: 135,
    /** Demand multiplier = demandBase + demandSpan * demandPressure + heatDemand * heatStress. */
    demandBase: 0.7,
    demandSpan: 0.6,
    heatDemand: 0.2,
    /** Share of supply lost at pipelineFailure = 1. */
    pipeLoss: 0.5,
    /** Share of demand that full local storage can cover. */
    storageBuffer: 0.45,
    /** Storage drawn down per hour at a 100% supply gap. */
    storageDrainPerHour: 0.6,
    facilityShortThreshold: 55,
    /** Max share of a cell's scarcity risk a tanker covering its whole deficit removes. */
    tankerRiskRelief: 0.5,
  },

  confidence: { base: 0.88, horizonDecayPerHour: 0.3, evidenceGain: 0.08, min: 0.3, max: 0.98 },

  interventions: {
    /** A clear drain still fails by base + byCondition * (1 - condition): clearing restores capacity, not condition. */
    clearDrainBase: 0.05,
    clearDrainByCondition: 0.3,
    clearDrainIncident: 0.5,
    /** DEPLOY_PUMP: pressure removed per step at the target by a pumpRefCapacity pump. */
    pumpOutflowPerStep: 0.04,
    pumpRefCapacity: 3000,
    /** Rings around the target the pump reaches, and the falloff per ring. */
    pumpRadius: 1,
    pumpFalloff: 0.6,
    repairSupplyRecovery: 0.8,
    repairFailureResidual: 0.15,
    repairOutageResidual: 0.5,
    /** CLOSE_ROAD removes the roadExposure share of exposure within this many rings. */
    roadRadius: 1,
    /** ISSUE_ALERT: share of exposure avoided by behaviour, within alertRadius rings. */
    alertExposureCut: 0.1,
    alertRadius: 2,
    /** DISPATCH_CREW: on-site crew cuts incident pressure and speeds up the rest of the bundle. */
    crewIncidentRelief: 0.8,
    crewSpeedup: 0.75,
    travelSpeedKmh: 18,
    setupMin: { CLEAR_DRAIN: 14, DEPLOY_PUMP: 8, REPAIR_PIPE: 35, SEND_TANKER: 10, CLOSE_ROAD: 6, DISPATCH_CREW: 2, ISSUE_ALERT: 2 } as Record<InterventionKind, number>,
    kindCostLakh: { CLEAR_DRAIN: 0.8, DEPLOY_PUMP: 0.5, REPAIR_PIPE: 2.5, SEND_TANKER: 0.2, CLOSE_ROAD: 0.3, DISPATCH_CREW: 0.1, ISSUE_ALERT: 0.05 } as Record<InterventionKind, number>,
    kindConfidence: { CLEAR_DRAIN: 0.92, DEPLOY_PUMP: 0.88, REPAIR_PIPE: 0.85, SEND_TANKER: 0.9, CLOSE_ROAD: 0.8, DISPATCH_CREW: 0.75, ISSUE_ALERT: 0.6 } as Record<InterventionKind, number>,
    /** Equity: mean vulnerability of the cells where reduction lands that earns full marks. */
    equityVulnRef: 0.6,
    equityVulnShare: 0.7,
    /** Proxy incident length used for durationChangeMin. */
    incidentDurationMin: 180,
    /** Horizon used for before/expected numbers when a bundle is committed. */
    commitHorizon: 30 as const,
    /** Simulated "observed" result differs from expected by up to this share. */
    observedJitter: 0.04,
  },

  auction: {
    weights: { exposureReduction: 0.4, facilitiesProtected: 0.2, equity: 0.15, confidence: 0.1, costPenalty: 0.08, responseTimePenalty: 0.07 } as AuctionWeights,
    maxCandidates: 40,
    costRefLakh: 8,
    responseRefMin: 60,
    /** Weighted facilities (hospital 1, other 0.5) that earn the full facilities term. */
    facilityRef: 1,
    hospitalWeight: 1,
    otherFacilityWeight: 0.5,
  },

  evidence: {
    fuseRadiusM: 400,
    fuseWindowMin: 90,
    escalateAt: 70,
    verifyAt: 40,
    /** Sums to 1. */
    weights: {
      ai_confidence: 0.2,
      gps_consistency: 0.1,
      time_consistency: 0.08,
      independent_confirmations: 0.2,
      weather_consistency: 0.14,
      duplicate_check: 0.08,
      validator: 0.1,
      infrastructure_correlation: 0.1,
    } as Record<ScoreComponentKey, number>,
    /** Component values when no AI analysis is attached yet. */
    pendingAiValue: 30,
    pendingDuplicateValue: 70,
    invalidHazardFactor: 0.2,
    singleReportTimeValue: 50,
    /** GPS accuracy (m) that earns full / minimum marks; unknown accuracy earns unknownAccuracy. */
    gpsGoodM: 50,
    gpsBadM: 500,
    unknownAccuracy: 0.6,
    /** confirmations value = (sum of distinct reporter trust - offset) / span. */
    confirmationOffset: 0.5,
    confirmationSpan: 2,
    /** Rain / supply stress that counts as fully consistent weather. */
    weatherRef: 0.8,
    trustedReporter: 0.75,
    infraConditionShare: 0.4,
    infraHistoryRef: 6,
    passAt: 70,
    warnAt: 40,
    /** A fully trusted blocked-drain incident pushes its drain's cells to this drainageFailure. */
    blockedDrainFailure: 0.95,
    defaultSeverity: 3,
  },

  priorities: {
    /** Sums to 1. */
    weights: { recurrence: 0.22, severity: 0.18, exposure: 0.14, criticalFacilities: 0.1, lowEffectiveness: 0.12, condition: 0.1, costEfficiency: 0.04, currentRisk: 0.1 },
    recurrenceRef: 12,
    exposureRef: 5000,
    facilityRef: 2,
    costRefLakh: 60,
    riskHorizon: 30 as const,
    tier1At: 60,
    tier2At: 35,
  },

  /** Rain input: upstreamPressure = gain * (uphill share of the cells within `rings`) * their mean rainfall. */
  weather: { upstreamGain: 1.5, upstreamRings: 2 },

  tankers: { horizon: 30 as const, hospitalEquityBase: 0.6 },
};
