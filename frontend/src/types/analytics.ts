export type AnalyticsSummary = {
  totalEvents: number;
  totalRsvps: number;
  activeUsers: number;
  averageRsvpsPerEvent: number;
  eventsWithRsvps: number;
};

export type AnalyticsRangeInfo = {
  key: string;
  label: string;
  start: string;
  end: string;
  monthCount: number;
};

export type AnalyticsChartPoint = {
  period: string;
  count: number;
};

export type AnalyticsCategorySlice = {
  label: string;
  count: number;
  percentage: number;
};

export type AnalyticsTagCount = {
  tag: string;
  count: number;
};

export type AnalyticsDayPopularity = {
  dayOfWeek: number;
  label: string;
  count: number;
};

export type AnalyticsHourPopularity = {
  hour: number;
  label: string;
  count: number;
};

export type AnalyticsPopularTimes = {
  byDay: AnalyticsDayPopularity[];
  byHour: AnalyticsHourPopularity[];
};

export type AnalyticsTagDataset = {
  label: string;
  start: string;
  end: string;
  data: AnalyticsTagCount[];
};

export type AnalyticsTagPopularity = {
  currentMonth: AnalyticsTagDataset;
  pastThreeMonths: AnalyticsTagDataset;
  pastSixMonths: AnalyticsTagDataset;
  pastYear: AnalyticsTagDataset;
};

export type AnalyticsDashboardResponse = {
  generatedAt: string;
  range: AnalyticsRangeInfo;
  summary: AnalyticsSummary;
  attendanceTrend: AnalyticsChartPoint[];
  categoryDistribution: AnalyticsCategorySlice[];
  popularEventTimes: AnalyticsPopularTimes;
  newUserGrowth: AnalyticsChartPoint[];
  eventTagPopularity: AnalyticsTagPopularity;
};
