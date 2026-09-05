import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Box, Button, Card, CardActions, CardContent, CircularProgress, Link, Stack, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import { Link as RouterLink } from 'react-router-dom';

import apiClient from '../../../lib/apiClient';
import { PASS_SESSIONS_ENDPOINT } from '../../../utils/passSessions';
import type { PassSessionApi } from '../../../utils/passSessions';
import type { PassSessionRecord } from '../../../types/dashboard';
import { loadPassSessionsSnapshot, savePassSessionsSnapshot } from '../../../utils/offlineStorage';

type ImportStatus = { type: 'success' | 'error' | 'info'; message: string } | null;

// Displays and manages upcoming PASS study sessions.
const DashboardPassSection = () => {
  const [sessions, setSessions] = useState<PassSessionRecord[]>([]);
  const [status, setStatus] = useState<ImportStatus>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ReactNode>(null);
  const [showAllSessions, setShowAllSessions] = useState(false);

  // Retrieves PASS sessions from the backend.
  const refreshSessions = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(PASS_SESSIONS_ENDPOINT, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const data = (await response.json()) as unknown;
      if (Array.isArray(data)) {
        const normalisedSessions = data
          .filter(
            (item): item is PassSessionApi =>
              Boolean(item) &&
              typeof item.id === 'string' &&
              typeof item.meetingTime === 'string' &&
              typeof item.studentLecturer === 'string' &&
              typeof item.venue === 'string' &&
              typeof item.meetLink === 'string',
          )
          .map((item) => ({
            id: item.id,
            meetingTime: item.meetingTime.trim(),
            studentLecturer: item.studentLecturer.trim(),
            venue: item.venue.trim(),
            meetLink: item.meetLink.trim(),
          }));

        setSessions(normalisedSessions);
        savePassSessionsSnapshot({
          updatedAt: new Date().toISOString(),
          sessions: normalisedSessions,
        });
      } else {
        setSessions([]);
        savePassSessionsSnapshot({
          updatedAt: new Date().toISOString(),
          sessions: [],
        });
      }
    } catch (err) {
      console.error('Failed to load PASS sessions', err);
      setSessions([]);
      const isNavigatorOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setLoadError(
        isNavigatorOffline ? (
          <>
            You are offline. Showing the latest PASS sessions saved on this device.{' '}
            <Link component={RouterLink} to="/offline" underline="always" color="inherit">
              View offline page
            </Link>
            .
          </>
        ) : (
          'We could not load your PASS sessions right now. Please try again later.'
        ),
      );
      const cached = loadPassSessionsSnapshot();
      if (cached) {
        setSessions(cached.sessions);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  // Clears all stored PASS sessions after confirmation.
  const handleClear = useCallback(async () => {
    if (sessions.length === 0) {
      return;
    }
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('Clear all PASS sessions?');
      if (!confirmed) {
        return;
      }
    }

    try {
      await apiClient.delete(PASS_SESSIONS_ENDPOINT);
      setStatus({ type: 'info', message: 'All PASS sessions have been cleared.' });
      await refreshSessions();
    } catch (err) {
      console.error('Failed to clear PASS sessions', err);
      const message =
        apiClient.isAxiosError(err) && err.response?.status === 403
          ? 'You need to be signed in as a student or admin to clear PASS sessions.'
          : 'We could not clear your PASS sessions right now. Please try again later.';
      setStatus({
        type: 'error',
        message,
      });
    }
  }, [refreshSessions, sessions.length]);

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) =>
        a.meetingTime.localeCompare(b.meetingTime, undefined, { numeric: true, sensitivity: 'base' }),
      ),
    [sessions],
  );

  useEffect(() => {
    setShowAllSessions(false);
  }, [sortedSessions.length]);

  const hasMoreSessions = sortedSessions.length > 3;
  const visibleSessions = useMemo(
    () => (hasMoreSessions && !showAllSessions ? sortedSessions.slice(0, 3) : sortedSessions),
    [hasMoreSessions, showAllSessions, sortedSessions],
  );

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Button
          variant="contained"
          color="primary"
          component={RouterLink}
          to="/pass-scanner"
          disabled={loading}
        >
          Scan PASS QR code
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          onClick={handleClear}
          disabled={loading || sessions.length === 0}
        >
          Clear all sessions
        </Button>
      </Stack>

      {status ? (
        <Alert severity={status.type === 'error' ? 'error' : status.type === 'success' ? 'success' : 'info'}>
          {status.message}
        </Alert>
      ) : null}

      {loadError ? <Alert severity="error">{loadError}</Alert> : null}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress aria-label="Loading PASS sessions" />
        </Box>
      ) : sortedSessions.length === 0 ? (
        <Alert severity="info">Scan the PASS QR code to view your upcoming study sessions.</Alert>
      ) : (
        <Stack spacing={2}>
          <Grid container spacing={2}>
            {visibleSessions.map((session) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={session.id}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent sx={{ pb: 2 }}>
                    <Stack spacing={1}>
                      <Stack spacing={0.5}>
                        <Typography variant="overline" color="text.secondary">
                          Meeting time
                        </Typography>
                        <Typography variant="subtitle1">{session.meetingTime}</Typography>
                      </Stack>
                      <Typography variant="body2">
                        <strong>Student lecturer:</strong> {session.studentLecturer}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Venue:</strong> {session.venue}
                      </Typography>
                    </Stack>
                  </CardContent>
                  <CardActions sx={{ px: 2, pb: 2, pt: 0 }}>
                    <Button
                      component={Link}
                      href={session.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="outlined"
                      fullWidth
                    >
                      Open Google Meet
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
          {hasMoreSessions ? (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Button variant="text" onClick={() => setShowAllSessions((prev) => !prev)}>
                {showAllSessions
                  ? 'Show fewer sessions'
                  : `Show more sessions (${sortedSessions.length - 3} more)`}
              </Button>
            </Box>
          ) : null}
        </Stack>
      )}

    </Stack>
  );
};

export default DashboardPassSection;
