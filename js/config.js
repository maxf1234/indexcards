// Product configuration and monetization hooks.
//
// Today every feature is free. The `plan` system below exists so paid tiers can
// be switched on later without touching study-mode code: views call
// `can(feature)` and `limit(name)` rather than hard-coding access rules.
//
// Promise to users (see docs/PRODUCT.md): the CORE study experience — creating
// sets, every study mode, spaced repetition, import/export, sharing — is free
// forever with no round limits and no ads inside study sessions. Accounts and
// basic sync are free too. Paid tiers add things that cost real money to run
// (AI, large media storage, classrooms).

export const APP_NAME = 'IndexCards';

export const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    features: ['core', 'allModes', 'srs', 'importExport', 'linkShare', 'offline', 'accounts', 'cloudSync'],
    limits: { sets: Infinity, cardsPerSet: Infinity, studyRounds: Infinity },
  },
  // Not purchasable yet — defined so pricing UI and gates can be built ahead.
  pro: {
    name: 'Pro',
    price: 4,
    interval: 'month',
    features: ['aiGenerate', 'images', 'audioTTSVoices', 'advancedStats', 'customThemes'],
    limits: { aiCardsPerMonth: 2000, storageMb: 1024 },
  },
  teacher: {
    name: 'Teacher',
    price: 8,
    interval: 'month',
    features: ['classes', 'assignments', 'classAnalytics', 'liveGame'],
    limits: { students: 300 },
  },
};

// Flip to true when billing exists. While false, every gate returns "allowed".
export const MONETIZATION_ENABLED = false;

let currentPlan = 'free';

export function setPlan(plan) {
  if (PLANS[plan]) currentPlan = plan;
}

export function getPlan() {
  return currentPlan;
}

export function can(feature) {
  if (!MONETIZATION_ENABLED) return true;
  const order = ['free', 'pro', 'teacher'];
  const idx = order.indexOf(currentPlan);
  return order.slice(0, idx + 1).some((p) => PLANS[p].features.includes(feature));
}

export function limit(name) {
  if (!MONETIZATION_ENABLED) return Infinity;
  return PLANS[currentPlan].limits[name] ?? Infinity;
}
