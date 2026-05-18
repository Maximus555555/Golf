export type MetricStatus = 'good' | 'acceptable' | 'problematic' | 'unsupported';
export type MetricConfidence = 'high' | 'medium' | 'low';

export type ComputedSwingMetricsInput = {
  view?: 'face-on' | 'down-the-line' | 'unknown';
  handedness?: 'right' | 'left' | 'unknown';
  headMovement?: number | null;
  postureChange?: number | null;
  hipSway?: number | null;
  leadArmAngleTop?: number | null;
  shoulderTurnAngleTopPreferred?: number | null;
  shoulderTurnRatio?: number | null;
  confidence?: {
    headMovement?: MetricConfidence;
    postureChange?: MetricConfidence;
    hipSway?: MetricConfidence;
    leadArmAngleTop?: MetricConfidence;
    shoulderTurn?: MetricConfidence;
  };
  support?: {
    headMovement?: boolean;
    postureChange?: boolean;
    hipSway?: boolean;
    leadArmAngleTop?: boolean;
    shoulderTurn?: boolean;
  };
};

export type MetricResult = {
  id: string;
  label: string;
  value: number | null;
  units: string | null;
  status: MetricStatus;
  confidence: MetricConfidence;
  supported: boolean;
  proxyUsed?: boolean;
  notes?: string[];
  problemId?: string | null;
  commonProblems?: string[];
  likelyCauses?: string[];
  suggestedFix?: string | null;
  prioritizedFixes?: string[];
  drillList?: Array<{ id: string; title: string; steps: string[]; progressCriteria: string[] }>;
  feedbackMessage?: string | null;
};

export type GolfMetricEvaluationResult = {
  metrics: {
    headMovement: MetricResult;
    postureChange: MetricResult;
    hipSway: MetricResult;
    leadArmAngleTop: MetricResult;
    shoulderTurn: MetricResult;
  };
  summary: {
    goodCount: number;
    acceptableCount: number;
    problematicCount: number;
    unsupportedCount: number;
    primaryFocusIds: string[];
  };
};
