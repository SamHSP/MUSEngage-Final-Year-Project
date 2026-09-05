import { useMemo, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  loadDashboardSnapshot,
  loadPassSessionsSnapshot,
} from '../utils/offlineStorage';
import OfflineStatusBanner from '../components/OfflineStatusBanner';
import type { EventRecord, FeedbackRecord, PassSessionRecord, PurchaseRecord } from '../types/dashboard';

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

const createSnippet = (value: string, limit = 160) => {
  const normalised = value.replace(/\s+/g, ' ').trim();
  if (normalised.length <= limit) {
    return normalised;
  }
  return `${normalised.slice(0, limit).trimEnd()}…`;
};

const formatCurrency = (valueInCents: number) => {
  if (!Number.isFinite(valueInCents)) {
    return '—';
  }
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 2,
  }).format(valueInCents / 100);
};

const OfflineSection = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <Stack spacing={2}>
    <Box>
      <Typography variant="h5">{title}</Typography>
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>
    </Box>
    {children}
  </Stack>
);

const getFeedbackStatusColor = (
  status: string,
): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
  const normalised = status.toLowerCase();
  if (normalised.includes('resolved')) {
    return 'success';
  }
  if (normalised.includes('progress')) {
    return 'warning';
  }
  if (normalised.includes('closed')) {
    return 'default';
  }
  return 'info';
};

const OfflinePage = () => {
  const isOnline = useOnlineStatus();
  const dashboardSnapshot = useMemo(() => loadDashboardSnapshot(), []);
  const passSnapshot = useMemo(() => loadPassSessionsSnapshot(), []);

  const rsvpEvents: EventRecord[] = dashboardSnapshot?.rsvpEvents ?? [];
  const feedbackItems: FeedbackRecord[] = dashboardSnapshot?.feedbackItems ?? [];
  const rewardPoints = dashboardSnapshot?.rewardPoints ?? 0;
  const purchaseHistory: PurchaseRecord[] = dashboardSnapshot?.purchaseHistory ?? [];
  const passSessions: PassSessionRecord[] = passSnapshot?.sessions ?? [];

  return (
    <Box
      minHeight="100vh"
      display="flex"
      flexDirection="column"
      bgcolor="background.default"
    >
      <OfflineStatusBanner showOfflineLink={false} />
      <Container maxWidth="md" sx={{ py: { xs: 6, md: 10 } }}>
        <Stack spacing={4}>
          <Stack spacing={2}>
            <Typography variant="h3" component="h1">
              Offline mode
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Access the latest data saved on your device while you&apos;re disconnected.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Button component={RouterLink} to="/dashboard" variant="contained" color="primary">
                Return to dashboard
              </Button>
              <Button component={RouterLink} to="/events" variant="outlined">
                Browse events
              </Button>
            </Stack>
            <Alert severity={isOnline ? 'success' : 'warning'}>
              {isOnline
                ? 'You are back online. Refresh the dashboard to fetch the latest updates.'
                : 'You are offline. Content shown here is the most recent data saved on this device.'}
            </Alert>
            <Typography variant="caption" color="text.secondary">
              Last synced: {formatDateTime(dashboardSnapshot?.updatedAt ?? passSnapshot?.updatedAt ?? null)}
            </Typography>
          </Stack>

          <Divider />

          <OfflineSection
            title="Reward snapshot"
            description="Keep track of your reward balance saved from the last sync."
          >
            <Alert severity="info">
              Reward points stored locally: <strong>{rewardPoints.toLocaleString()}</strong>
            </Alert>
          </OfflineSection>

          <OfflineSection
            title="My RSVP events"
            description="Events you reserved a spot for during your last online session."
          >
            {rsvpEvents.length === 0 ? (
              <Alert severity="info">No RSVP events were cached on this device yet.</Alert>
            ) : (
              <Stack spacing={2}>
                {rsvpEvents.map((event) => (
                  <Card key={event.id} variant="outlined">
                    <CardContent>
                      <Stack spacing={1.5}>
                        <Typography variant="h6">{event.title}</Typography>
                        {event.subHeader ? (
                          <Typography variant="subtitle2" color="text.secondary">
                            {event.subHeader}
                          </Typography>
                        ) : null}
                        <Typography variant="body2" color="text.secondary">
                          {createSnippet(event.body)}
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          <Chip label={`${event.rewardPoints} reward pts`} color="primary" />
                          <Chip label={`Updated ${formatDateTime(event.updatedAt)}`} variant="outlined" />
                          {event.attendanceConfirmed ? (
                            <Chip
                              label={`Attendance confirmed ${formatDateTime(event.attendanceConfirmedAt)}`}
                              color="success"
                            />
                          ) : (
                            <Chip label="Awaiting attendance scan" color="info" variant="outlined" />
                          )}
                        </Stack>
                        {event.links?.length ? (
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            {event.links.map((link) => (
                              <Button
                                key={`${event.id}-${link.url}`}
                                component={Link}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="outlined"
                                size="small"
                              >
                                {link.label}
                              </Button>
                            ))}
                          </Stack>
                        ) : null}
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </OfflineSection>

          <OfflineSection
            title="My feedback"
            description="Cached submissions and their last known status."
          >
            {feedbackItems.length === 0 ? (
              <Alert severity="info">No feedback responses were saved for offline viewing yet.</Alert>
            ) : (
              <Stack spacing={2}>
                {feedbackItems.map((feedback) => (
                  <Card key={feedback.id} variant="outlined">
                    <CardContent>
                      <Stack spacing={1.25}>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          <Chip label={feedback.status} color={getFeedbackStatusColor(feedback.status)} />
                          <Chip
                            label={`Updated ${formatDateTime(feedback.updatedAt)}`}
                            variant="outlined"
                          />
                          {feedback.category ? <Chip label={feedback.category} variant="outlined" /> : null}
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          Submitted {formatDateTime(feedback.createdAt)}
                        </Typography>
                        <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                          {feedback.message}
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </OfflineSection>

          <OfflineSection
            title="Purchase history"
            description="Most recent shop orders saved from your last sync."
          >
            {purchaseHistory.length === 0 ? (
              <Alert severity="info">No purchase records were cached on this device yet.</Alert>
            ) : (
              <Stack spacing={2}>
                {purchaseHistory.map((purchase) => (
                  <Card key={purchase.id} variant="outlined">
                    <CardContent>
                      <Stack spacing={1.25}>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          <Chip label={purchase.status} color={purchase.status === 'completed' ? 'success' : 'info'} />
                          <Chip label={`Placed ${formatDateTime(purchase.createdAt)}`} variant="outlined" />
                          <Chip label={formatCurrency(purchase.totalAmount)} color="primary" />
                        </Stack>
                        <Typography variant="subtitle2">Shipping address</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                          {purchase.shippingAddress}
                        </Typography>
                        <Stack spacing={0.75}>
                          {purchase.items.map((item, index) => (
                            <Stack
                              key={`${purchase.id}-offline-item-${index}`}
                              direction="row"
                              justifyContent="space-between"
                              alignItems="center"
                            >
                              <Typography variant="body2">
                                {item.quantity} × {item.name}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {formatCurrency(item.price * item.quantity)}
                              </Typography>
                            </Stack>
                          ))}
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </OfflineSection>

          <OfflineSection
            title="PASS sessions"
            description="The most recent PASS schedule stored on this device."
          >
            {passSessions.length === 0 ? (
              <Alert severity="info">No PASS session data was cached yet. Scan a QR code when online to save it.</Alert>
            ) : (
              <Stack spacing={2}>
                {passSessions.map((session) => (
                  <Card key={session.id} variant="outlined">
                    <CardContent>
                      <Stack spacing={1.25}>
                        <Typography variant="subtitle1">{session.meetingTime}</Typography>
                        <Typography variant="body2">
                          <strong>Student lecturer:</strong> {session.studentLecturer}
                        </Typography>
                        <Typography variant="body2">
                          <strong>Venue:</strong> {session.venue}
                        </Typography>
                        <Button
                          component={Link}
                          href={session.meetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="outlined"
                          size="small"
                          sx={{ alignSelf: 'flex-start' }}
                        >
                          Open Google Meet
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </OfflineSection>
        </Stack>
      </Container>
    </Box>
  );
};

export default OfflinePage;
