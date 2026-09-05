import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SyntheticEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Container,
  Divider,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip as MuiTooltip,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Helmet } from 'react-helmet-async';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import PageHero from '../../components/PageHero';
import Loading from '../../components/Loading';
import { fetchAnalyticsDashboard } from '../../lib/analytics';
import type { AnalyticsDashboardResponse, AnalyticsTagDataset } from '../../types/analytics';
import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  LineChart as RechartsLineChart,
  Line,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from 'recharts';

const TIME_PERIOD_OPTIONS = [
  { value: 'current_month', label: 'Current month' },
  { value: 'past_3_months', label: 'Past 3 months' },
  { value: 'past_6_months', label: 'Past 6 months' },
  { value: 'past_year', label: 'Past year' },
  { value: 'custom', label: 'Custom range' },
] as const;

type TimePeriodValue = (typeof TIME_PERIOD_OPTIONS)[number]['value'];

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
});

function createCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value).replace(/"/g, '""');
  return `"${stringValue}"`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csvContent = rows.map((row) => row.map(createCsvValue).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatMonthLabel(value: string): string {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) {
    return value;
  }
  return monthFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
}

function renderEmptyState(message: string) {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 240, px: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
    </Stack>
  );
}

const AnalyticsPage = () => {
  const theme = useTheme();
  const [timePeriod, setTimePeriod] = useState<TimePeriodValue>('current_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsDashboardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [tagPopularityTab, setTagPopularityTab] = useState<'currentMonth' | 'pastThreeMonths' | 'pastSixMonths' | 'pastYear'>(
    'currentMonth',
  );
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const chartPalette = useMemo(
    () => [
      theme.palette.primary.main,
      theme.palette.secondary.main,
      theme.palette.aqua.main,
      theme.palette.yellow.main,
      theme.palette.orange.main,
      theme.palette.pink.main,
      theme.palette.green.main,
    ],
    [theme.palette.aqua.main, theme.palette.green.main, theme.palette.orange.main, theme.palette.pink.main, theme.palette.primary.main, theme.palette.secondary.main, theme.palette.yellow.main],
  );

  const handleTimePeriodChange = useCallback((event: SelectChangeEvent<TimePeriodValue>) => {
    const value = event.target.value as TimePeriodValue;
    setTimePeriod(value);
    if (value !== 'custom') {
      setCustomError(null);
    }
  }, []);

  const validateCustomRange = useCallback(() => {
    if (timePeriod !== 'custom') {
      return true;
    }
    if (!customStart || !customEnd) {
      setCustomError('Select both a start and end month.');
      return false;
    }
    if (customStart > customEnd) {
      setCustomError('Start month must be earlier than or equal to the end month.');
      return false;
    }
    setCustomError(null);
    return true;
  }, [customEnd, customStart, timePeriod]);

  const fetchAnalytics = useCallback(async () => {
    const isValid = validateCustomRange();
    if (timePeriod === 'custom' && !isValid) {
      return;
    }
    setLoading(true);
    try {
      const response = await fetchAnalyticsDashboard({
        rangeKey: timePeriod,
        startMonth: timePeriod === 'custom' ? customStart : undefined,
        endMonth: timePeriod === 'custom' ? customEnd : undefined,
      });
      setData(response);
      setError(null);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Failed to fetch analytics dashboard', err);
      }
      setError('Unable to load analytics right now. Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, [customEnd, customStart, timePeriod, validateCustomRange]);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  const handleTagPopularityTabChange = useCallback(
    (_event: SyntheticEvent, newValue: string) => {
      setTagPopularityTab(
        newValue as 'currentMonth' | 'pastThreeMonths' | 'pastSixMonths' | 'pastYear',
      );
    },
    [],
  );

  const selectedTagDataset: AnalyticsTagDataset | null = useMemo(() => {
    if (!data?.eventTagPopularity) {
      return null;
    }
    return data.eventTagPopularity[tagPopularityTab] ?? null;
  }, [data, tagPopularityTab]);

  const attendanceTrend = data?.attendanceTrend ?? [];
  const categoryDistribution = data?.categoryDistribution ?? [];
  const newUserGrowth = data?.newUserGrowth ?? [];

  const summary = data?.summary;

  const formatValue = (value: number) => numberFormatter.format(value);
  const formatNumericTick = (value: number) => formatValue(value);
  const formatLabelToString = (label: string | number) => String(label);
  const formatMonthTooltipLabel = (label: string | number) => formatMonthLabel(String(label));

  const tagBarData = useMemo(
    () =>
      selectedTagDataset
        ? selectedTagDataset.data.map((item) => ({
            tag: item.tag,
            count: item.count,
          }))
        : [],
    [selectedTagDataset],
  );

  const longestTagLabelLength = useMemo(
    () => tagBarData.reduce((max, item) => Math.max(max, item.tag.length), 0),
    [tagBarData],
  );

  const tagAxisWidth = useMemo(() => {
    if (!longestTagLabelLength) {
      return isSmallScreen ? 100 : 160;
    }
    const characterWidth = isSmallScreen ? 5.5 : 7.5;
    const calculatedWidth = longestTagLabelLength * characterWidth + (isSmallScreen ? 16 : 28);
    const minWidth = isSmallScreen ? 100 : 160;
    const maxWidth = isSmallScreen ? 180 : 260;
    return Math.min(maxWidth, Math.max(minWidth, calculatedWidth));
  }, [isSmallScreen, longestTagLabelLength]);

  const tagChartHeight = useMemo(() => {
    const minHeight = isSmallScreen ? 320 : 400;
    const perItemHeight = isSmallScreen ? 44 : 50;
    return Math.max(minHeight, tagBarData.length * perItemHeight);
  }, [isSmallScreen, tagBarData.length]);

  const tagChartMargin = useMemo(
    () => ({
      top: 20,
      right: isSmallScreen ? 20 : 30,
      left: 0,
      bottom: 32,
    }),
    [isSmallScreen],
  );

  const attendanceSeries = useMemo(
    () => attendanceTrend.map((point) => ({ period: point.period, count: point.count })),
    [attendanceTrend],
  );

  const newUserSeries = useMemo(
    () => newUserGrowth.map((point) => ({ period: point.period, count: point.count })),
    [newUserGrowth],
  );

  const categorySlices = useMemo(
    () =>
      categoryDistribution.map((slice, index) => ({
        label: slice.label,
        count: slice.count,
        percentage: slice.percentage,
        color: chartPalette[index % chartPalette.length],
      })),
    [categoryDistribution, chartPalette],
  );

  const dayPopularityBars = useMemo(
    () => data?.popularEventTimes.byDay.map((item) => ({ label: item.label, count: item.count })) ?? [],
    [data],
  );

  const hourPopularitySeries = useMemo(
    () => data?.popularEventTimes.byHour.map((item) => ({ label: item.label, count: item.count })) ?? [],
    [data],
  );

  const handleExportCsv = useCallback(() => {
    if (!data) {
      return;
    }
    const rows: string[][] = [];
    rows.push(['MUSEngage Analytics Report']);
    rows.push(['Generated at', new Date(data.generatedAt).toISOString()]);
    rows.push(['Selected range', data.range.label]);
    rows.push([]);
    rows.push(['Metric', 'Value']);
    rows.push(['Total events', String(summary?.totalEvents ?? 0)]);
    rows.push(['Total RSVPs', String(summary?.totalRsvps ?? 0)]);
    rows.push(['Active users', String(summary?.activeUsers ?? 0)]);
    rows.push(['Average RSVPs per event', String(summary?.averageRsvpsPerEvent ?? 0)]);
    rows.push(['Events with RSVPs', String(summary?.eventsWithRsvps ?? 0)]);
    rows.push([]);

    rows.push(['Attendance trend']);
    rows.push(['Month', 'RSVP count']);
    attendanceTrend.forEach((point) => {
      rows.push([formatMonthLabel(point.period), String(point.count)]);
    });
    rows.push([]);

    rows.push(['New user growth']);
    rows.push(['Month', 'Registrations']);
    newUserGrowth.forEach((point) => {
      rows.push([formatMonthLabel(point.period), String(point.count)]);
    });
    rows.push([]);

    const dataset = selectedTagDataset;
    if (dataset) {
      rows.push([`Event tag popularity – ${dataset.label}`]);
      rows.push(['Tag', 'RSVP count']);
      dataset.data.forEach((item) => {
        rows.push([item.tag, String(item.count)]);
      });
      rows.push([]);
    }

    downloadCsv(`musengage-analytics-${Date.now()}.csv`, rows);
  }, [attendanceTrend, data, newUserGrowth, selectedTagDataset, summary]);

  const handleExportPdf = useCallback(() => {
    if (!data) {
      return;
    }
    const reportWindow = window.open('', '_blank', 'width=900,height=700');
    if (!reportWindow) {
      return;
    }
    const generated = new Date(data.generatedAt).toLocaleString();
    const summaryRows = [
      `<li><strong>Total events:</strong> ${summary?.totalEvents ?? 0}</li>`,
      `<li><strong>Total RSVPs:</strong> ${summary?.totalRsvps ?? 0}</li>`,
      `<li><strong>Active users:</strong> ${summary?.activeUsers ?? 0}</li>`,
      `<li><strong>Average RSVPs per event:</strong> ${summary?.averageRsvpsPerEvent ?? 0}</li>`,
      `<li><strong>Events with RSVPs:</strong> ${summary?.eventsWithRsvps ?? 0}</li>`,
    ].join('');
    const tagList =
      selectedTagDataset && selectedTagDataset.data.length > 0
        ? selectedTagDataset.data
            .map((item) => `<li>${item.tag}: ${item.count}</li>`)
            .join('')
        : '<li>No tag engagement recorded for this range.</li>';
    const categoryList =
      categoryDistribution.length > 0
        ? categoryDistribution
            .map((slice) => `<li>${slice.label}: ${slice.count} (${slice.percentage}%)</li>`)
            .join('')
        : '<li>No events with categories recorded in this range.</li>';

    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>MUSEngage analytics report</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #1f2933; }
      h1 { margin-top: 0; }
      ul { margin-top: 8px; }
      li { margin-bottom: 6px; }
      .section { margin-top: 18px; }
    </style>
  </head>
  <body>
    <h1>MUSEngage analytics report</h1>
    <p><strong>Generated:</strong> ${generated}</p>
    <p><strong>Range:</strong> ${data.range.label}</p>
    <div class="section">
      <h2>Key metrics</h2>
      <ul>${summaryRows}</ul>
    </div>
    <div class="section">
      <h2>Event tag popularity – ${selectedTagDataset?.label ?? 'Selected range'}</h2>
      <ul>${tagList}</ul>
    </div>
    <div class="section">
      <h2>Event category distribution</h2>
      <ul>${categoryList}</ul>
    </div>
  </body>
</html>`;

    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  }, [categoryDistribution, data, selectedTagDataset, summary]);

  if (!data && loading) {
    return <Loading />;
  }

  return (
    <>
      <Helmet>
        <title>Analytics dashboard | MUSEngage</title>
      </Helmet>
      <PageHero
        theme="neutral"
        eyebrow="Insights"
        title="Analytics dashboard"
        description="Track engagement trends, understand what resonates with students, and export privacy-first analytics without exposing personal data."
      />
      <Container maxWidth="xl" sx={{ py: { xs: 4, md: 6 } }}>
        <Stack spacing={3}>
          {loading ? <LinearProgress color="secondary" /> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} justifyContent="space-between">
                <Stack spacing={1.5} flex={1}>
                  <Typography variant="h6">Time period</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
                    <FormControl sx={{ minWidth: { xs: '100%', sm: 220 } }}>
                      <InputLabel id="analytics-period-label">Select period</InputLabel>
                      <Select
                        labelId="analytics-period-label"
                        label="Select period"
                        value={timePeriod}
                        onChange={handleTimePeriodChange}
                      >
                        {TIME_PERIOD_OPTIONS.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    {timePeriod === 'custom' ? (
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flex={1}>
                        <TextField
                          label="Start month"
                          type="month"
                          value={customStart}
                          onChange={(event) => setCustomStart(event.target.value)}
                          fullWidth
                        />
                        <TextField
                          label="End month"
                          type="month"
                          value={customEnd}
                          onChange={(event) => setCustomEnd(event.target.value)}
                          fullWidth
                        />
                      </Stack>
                    ) : null}
                  </Stack>
                  {customError ? (
                    <Typography variant="body2" color="error.main">
                      {customError}
                    </Typography>
                  ) : null}
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
                  <MuiTooltip title="Refresh analytics">
                    <Button
                      variant="outlined"
                      color="primary"
                      startIcon={<RefreshIcon />}
                      onClick={() => void fetchAnalytics()}
                    >
                      Refresh
                    </Button>
                  </MuiTooltip>
                  <MuiTooltip title="Export analytics as CSV">
                    <Button
                      variant="outlined"
                      color="secondary"
                      startIcon={<DownloadIcon />}
                      onClick={handleExportCsv}
                    >
                      Export CSV
                    </Button>
                  </MuiTooltip>
                  <MuiTooltip title="Export analytics as PDF">
                    <Button variant="contained" color="primary" onClick={handleExportPdf} startIcon={<DownloadIcon />}>
                      Export PDF
                    </Button>
                  </MuiTooltip>
                </Stack>
              </Stack>
              {data ? (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} mt={3} alignItems="center">
                  <Chip label={data.range.label} color="primary" variant="outlined" />
                  <Typography variant="body2" color="text.secondary">
                    Reporting period: {new Date(data.range.start).toLocaleDateString()} –{' '}
                    {new Date(data.range.end).toLocaleDateString()}
                  </Typography>
                </Stack>
              ) : null}
            </CardContent>
          </Card>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 3 }}>
              <Card>
                <CardContent>
                  <Typography variant="overline" color="text.secondary">
                    Total events
                  </Typography>
                  <Typography variant="h4">{numberFormatter.format(summary?.totalEvents ?? 0)}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Card>
                <CardContent>
                  <Typography variant="overline" color="text.secondary">
                    Total RSVPs
                  </Typography>
                  <Typography variant="h4">{numberFormatter.format(summary?.totalRsvps ?? 0)}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Card>
                <CardContent>
                  <Typography variant="overline" color="text.secondary">
                    Active users
                  </Typography>
                  <Typography variant="h4">{numberFormatter.format(summary?.activeUsers ?? 0)}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Card>
                <CardContent>
                  <Typography variant="overline" color="text.secondary">
                    Avg RSVPs per event
                  </Typography>
                  <Typography variant="h4">{numberFormatter.format(summary?.averageRsvpsPerEvent ?? 0)}</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardHeader title="Event attendance trend" subheader="Monthly RSVP volume" />
                <Divider />
                <CardContent>
                  <Box sx={{ height: 320 }}>
                    {attendanceSeries.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsLineChart
                          data={attendanceSeries}
                          margin={{ top: 16, right: 24, left: 12, bottom: 16 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="period" tickFormatter={formatMonthLabel} />
                          <YAxis allowDecimals={false} tickFormatter={formatNumericTick} />
                          <RechartsTooltip
                            formatter={(value: number) => formatValue(value)}
                            labelFormatter={formatMonthTooltipLabel}
                          />
                          <Line
                            type="monotone"
                            dataKey="count"
                            stroke={theme.palette.primary.main}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                        </RechartsLineChart>
                      </ResponsiveContainer>
                    ) : (
                      renderEmptyState('No RSVPs recorded for the selected period.')
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardHeader title="Event category distribution" subheader="Share of events by tag" />
                <Divider />
                <CardContent>
                  <Box sx={{ height: 320 }}>
                    {categorySlices.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                          <RechartsTooltip
                            formatter={(value: number, _name: string | number, entry: { payload?: { percentage?: number } }) => `${formatValue(value)} (${(entry?.payload?.percentage ?? 0).toFixed(2)}%)`}
                          />
                          <Pie
                            data={categorySlices}
                            dataKey="count"
                            nameKey="label"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={110}
                            paddingAngle={4}
                          >
                            {categorySlices.map((slice) => (
                              <Cell key={slice.label} fill={slice.color} />
                            ))}
                          </Pie>
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    ) : (
                      renderEmptyState('Events created during this period do not have category tags yet.')
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardHeader title="New user growth" subheader="Monthly registrations" />
                <Divider />
                <CardContent>
                  <Box sx={{ height: 320 }}>
                    {newUserSeries.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsLineChart
                          data={newUserSeries}
                          margin={{ top: 16, right: 24, left: 12, bottom: 16 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="period" tickFormatter={formatMonthLabel} />
                          <YAxis allowDecimals={false} tickFormatter={formatNumericTick} />
                          <RechartsTooltip
                            formatter={(value: number) => formatValue(value)}
                            labelFormatter={formatMonthTooltipLabel}
                          />
                          <Line
                            type="monotone"
                            dataKey="count"
                            stroke={theme.palette.secondary.main}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                        </RechartsLineChart>
                      </ResponsiveContainer>
                    ) : (
                      renderEmptyState('No new user registrations in this window.')
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardHeader title="Popular event times" subheader="Created events by day and hour" />
                <Divider />
                <CardContent>
                  <Stack spacing={3}>
                    <Box sx={{ height: 200 }}>
                      {dayPopularityBars.some((item) => item.count > 0) ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsBarChart
                            data={dayPopularityBars}
                            margin={{ top: 8, right: 16, left: 16, bottom: 24 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                            <YAxis allowDecimals={false} tickFormatter={formatNumericTick} />
                            <RechartsTooltip
                              formatter={(value: number) => formatValue(value)}
                              labelFormatter={formatLabelToString}
                            />
                            <Bar dataKey="count" fill={theme.palette.orange.main} radius={[6, 6, 0, 0]} />
                          </RechartsBarChart>
                        </ResponsiveContainer>
                      ) : (
                        renderEmptyState('No events available to analyse popular days yet.')
                      )}
                    </Box>
                    <Box sx={{ height: 200 }}>
                      {hourPopularitySeries.some((item) => item.count > 0) ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsLineChart
                            data={hourPopularitySeries}
                            margin={{ top: 8, right: 16, left: 16, bottom: 16 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="label" interval={2} tick={{ fontSize: 12 }} />
                            <YAxis allowDecimals={false} tickFormatter={formatNumericTick} />
                            <RechartsTooltip
                              formatter={(value: number) => formatValue(value)}
                              labelFormatter={formatLabelToString}
                            />
                            <Line
                              type="monotone"
                              dataKey="count"
                              stroke={theme.palette.info.main}
                              strokeWidth={2}
                              dot={false}
                            />
                          </RechartsLineChart>
                        </ResponsiveContainer>
                      ) : (
                        renderEmptyState('No events available to analyse hourly trends yet.')
                      )}
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Card>
                <CardHeader
                  title="Event tag popularity"
                  subheader="Identify the tags that attract the most RSVP engagement"
                  sx={{
                    '& .MuiCardHeader-title': {
                      color: theme.palette.primary.main,
                      fontWeight: 600,
                    },
                  }}
                />
                <Divider />
                <CardContent sx={{ px: { xs: 1, sm: 2 } }}>
                  <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                    <Tabs
                      value={tagPopularityTab}
                      onChange={handleTagPopularityTabChange}
                      aria-label="Tag popularity time range"
                      variant="scrollable"
                      scrollButtons="auto"
                      sx={{
                        '& .MuiTab-root': {
                          textTransform: 'none',
                          fontSize: '0.875rem',
                          minWidth: 'auto',
                          px: 2,
                        },
                        '& .Mui-selected': {
                          color: theme.palette.primary.main,
                        },
                        '& .MuiTabs-indicator': {
                          backgroundColor: theme.palette.primary.main,
                        },
                      }}
                    >
                      <Tab label="This month" value="currentMonth" />
                      <Tab label="Past 3 months" value="pastThreeMonths" />
                      <Tab label="Past 6 months" value="pastSixMonths" />
                      <Tab label="Past year" value="pastYear" />
                    </Tabs>
                  </Box>

                  <Box sx={{ width: '100%', overflowX: 'auto', ml: { xs: -1, sm: 0 }, mr: 0 }}>
                    {selectedTagDataset && tagBarData.length > 0 ? (
                      <Box sx={{ minWidth: isSmallScreen ? undefined : 600, pl: { xs: 0, sm: 0 }, pr: { xs: 2, sm: 0 } }}>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ mb: 2, display: 'block', px: { xs: 1, sm: 0 } }}
                        >
                          {selectedTagDataset.label} ({new Date(selectedTagDataset.start).toLocaleDateString()} – {new Date(selectedTagDataset.end).toLocaleDateString()})
                        </Typography>
                        <Box sx={{ height: tagChartHeight }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartsBarChart
                              data={tagBarData}
                              layout="vertical"
                              margin={tagChartMargin}
                              barCategoryGap={12}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                              <XAxis
                                type="number"
                                tick={{ fontSize: 12 }}
                                label={{
                                  value: 'RSVP count',
                                  position: 'insideBottom',
                                  offset: -30,
                                  fill: theme.palette.text.secondary,
                                }}
                              />
                              <YAxis
                                type="category"
                                dataKey="tag"
                                interval={0}
                                width={tagAxisWidth}
                                tick={{
                                  fontSize: isSmallScreen ? 11 : 12,
                                  fill: theme.palette.text.primary,
                                }}
                                tickLine={false}
                                axisLine={false}
                              />
                              <RechartsTooltip
                                formatter={(value: number) => formatValue(value)}
                                labelFormatter={(label: string) => label}
                              />
                              <Bar
                                dataKey="count"
                                fill={theme.palette.primary.main}
                                radius={[0, 6, 6, 0]}
                              />
                            </RechartsBarChart>
                          </ResponsiveContainer>
                        </Box>
                      </Box>
                    ) : (
                      renderEmptyState('No tag popularity data available for the selected period.')
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

        </Stack>
      </Container>
    </>
  );
};

export default AnalyticsPage;
