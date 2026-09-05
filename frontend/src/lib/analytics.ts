import apiClient from './apiClient';
import type { AnalyticsDashboardResponse } from '../types/analytics';

type AnalyticsQuery = {
  rangeKey?: string | null;
  startMonth?: string | null;
  endMonth?: string | null;
};

const API_BASE = import.meta.env.VITE_BACKEND_API;

export async function fetchAnalyticsDashboard({
  rangeKey,
  startMonth,
  endMonth,
}: AnalyticsQuery): Promise<AnalyticsDashboardResponse> {
  const params = new URLSearchParams();
  if (rangeKey) {
    params.set('range', rangeKey);
  }
  if (startMonth) {
    params.set('startMonth', startMonth);
  }
  if (endMonth) {
    params.set('endMonth', endMonth);
  }
  const baseUrl = API_BASE ? `${API_BASE}/api/analytics/dashboard` : '/api/analytics/dashboard';
  const url = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
  const response = await apiClient.get<AnalyticsDashboardResponse>(url);
  return response.data;
}
