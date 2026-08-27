import type { LayerKey, StatusLevel } from './types';

export const COLORS = {
  navy: '#1B3A5C',
  ink: '#1A1A1A',
  body: '#3A3D42',
  muted: '#9EA3AF',
  paper: '#F0EFE9',
  card: '#FFFFFF',
  line: '#E4E2DC',
  soft: '#F5F3EE',
  green: '#28775A',
  blue: '#2563EB',
  orange: '#C47B0E',
  red: '#C23535',
};

export const STATUS_CONFIG: Record<StatusLevel, { bg: string; text: string }> = {
  CLEAR: { bg: '#E5F5EE', text: '#28775A' },
  AWARE: { bg: '#E6F0FB', text: '#2462A8' },
  PREPARE: { bg: '#FEF3DB', text: '#C47B0E' },
  ACT: { bg: '#FEEAEA', text: '#C23535' },
  RECOVER: { bg: '#E5F0F0', text: '#2A7070' },
};

export const REFRESH_STEPS = [
  'Getting your location',
  'Checking official weather alerts',
  'Checking nearby wildfires',
  'Checking recent earthquakes',
  'Comparing with your previous update',
];

export const SUGGESTED_PROMPTS = [
  'Do I need to leave?',
  'Am I in an evacuation zone?',
  'What should I pack?',
  'What changed since my last refresh?',
  'Why are you telling me to prepare?',
  'Where did this information come from?',
];

export const SCRIPTED_RESPONSES: Record<string, { text: string; source?: string }> = {
  'Do I need to leave?': {
    text: 'No evacuation order currently includes your location. An evacuation warning has expanded nearby, so the current recommendation is to prepare essential items and continue monitoring official updates.',
    source: 'Santa Clara County OES · Updated 8 min ago',
  },
  'Am I in an evacuation zone?': {
    text: 'Your location in San Jose, CA falls within an Evacuation Warning zone. You are not currently in an Evacuation Order zone.',
    source: 'Santa Clara County OES · Zone B',
  },
  'What should I pack?': {
    text: 'Prioritize ID, prescription medications, chargers, a backup battery, water, non-perishable food, important documents, and a change of clothes.',
    source: 'Suggested by crisis agent · Not official guidance',
  },
  'What changed since my last refresh?': {
    text: 'The Canyon Fire grew to 4,200 acres, the evacuation warning expanded south, and a new road closure was reported on Almaden Expressway. Your personal evacuation status has not changed.',
    source: 'CAL FIRE & Santa Clara County OES',
  },
  'Why are you telling me to prepare?': {
    text: 'An official Evacuation Warning has been issued near your current location. A warning means evacuation is possible and you should be ready to leave quickly.',
    source: 'Santa Clara County Emergency Management',
  },
  'Where did this information come from?': {
    text: 'The summary checks Santa Clara County OES, CAL FIRE, NWS Bay Area, and 511 SF Bay for evacuation zones, fire status, weather, and road closures.',
    source: 'CAL FIRE, Santa Clara County OES, NWS, 511 SF Bay',
  },
};

export const DEFAULT_RESPONSE = {
  text: 'Based on official data for San Jose, CA, there is an active Evacuation Warning nearby due to the Canyon Fire. No evacuation order currently covers your location.',
  source: 'Santa Clara County OES & CAL FIRE',
};

export const LAYERS: { key: LayerKey; label: string; color: string }[] = [
  { key: 'myLocation', label: 'My Location', color: COLORS.blue },
  { key: 'wildfire', label: 'Wildfire', color: '#DC5012' },
  { key: 'evacWarning', label: 'Evac Warning', color: COLORS.orange },
  { key: 'evacOrder', label: 'Evac Order', color: COLORS.red },
];

export const SHEET_CONTENT = {
  wildfire: {
    title: 'Canyon Fire',
    rows: [
      ['Status', 'Active'],
      ['Size', '4,200 acres'],
      ['Contained', '25%'],
      ['Behavior', 'Creeping, moderate rate of spread'],
      ['Wind', 'SW 12 mph, gusting to 24'],
    ],
    source: 'CAL FIRE — Canyon Fire Incident',
    updated: '8 minutes ago',
  },
  evacWarning: {
    title: 'Evacuation Warning',
    rows: [
      ['Status', 'Active'],
      ['Zone', 'Zone B — Almaden Valley South'],
      ['Issued', 'Today at 11:42 AM'],
      ['Meaning', 'Prepare to evacuate. Leave early if you need extra time.'],
    ],
    source: 'Santa Clara County OES',
    updated: '38 minutes ago',
  },
  evacOrder: {
    title: 'Evacuation Order',
    rows: [
      ['Status', 'Active'],
      ['Zone', 'Zone A — Almaden Foothills'],
      ['Issued', 'Today at 10:18 AM'],
      ['Meaning', 'Leave immediately. Do not return until the order is lifted.'],
    ],
    source: 'Santa Clara County OES',
    updated: '38 minutes ago',
  },
};
