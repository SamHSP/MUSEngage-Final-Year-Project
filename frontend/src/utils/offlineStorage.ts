import type {
  EventRecord,
  FeedbackRecord,
  PassSessionRecord,
  PurchaseRecord,
  RewardRedemptionRecord,
} from '../types/dashboard';

const DASHBOARD_STORAGE_KEY = 'muse.offline.dashboard.v1';
const PASS_STORAGE_KEY = 'muse.offline.pass.v1';

type DashboardSnapshot = {
  updatedAt: string;
  rewardPoints: number;
  rsvpEvents: EventRecord[];
  feedbackItems: FeedbackRecord[];
  rewardRedemptions: RewardRedemptionRecord[];
  purchaseHistory: PurchaseRecord[];
};

type PassSessionsSnapshot = {
  updatedAt: string;
  sessions: PassSessionRecord[];
};

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const safeParse = <T>(value: string | null): T | null => {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.error('Failed to parse offline cache entry', error);
    return null;
  }
};

export const saveDashboardSnapshot = (snapshot: DashboardSnapshot) => {
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.error('Failed to persist dashboard snapshot', error);
  }
};

export const loadDashboardSnapshot = (): DashboardSnapshot | null => {
  if (!isBrowser()) {
    return null;
  }
  return safeParse<DashboardSnapshot>(window.localStorage.getItem(DASHBOARD_STORAGE_KEY));
};

export const savePassSessionsSnapshot = (snapshot: PassSessionsSnapshot) => {
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.setItem(PASS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.error('Failed to persist PASS sessions snapshot', error);
  }
};

export const loadPassSessionsSnapshot = (): PassSessionsSnapshot | null => {
  if (!isBrowser()) {
    return null;
  }
  return safeParse<PassSessionsSnapshot>(window.localStorage.getItem(PASS_STORAGE_KEY));
};
