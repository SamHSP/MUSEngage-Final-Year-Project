import {
  type ChangeEvent,
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import axios from 'axios';
import { alpha } from '@mui/material/styles';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Pagination,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Container,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
  Tab,
  Tabs,
} from '@mui/material';
import { NavLink } from 'react-router-dom';
import PageHero from '../../components/PageHero';
import Seo from '../../components/Seo';
import DashboardPassSection from './components/DashboardPassSection';
import { useAuth } from '../../context/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import type {
  EventRecord,
  FeedbackRecord,
  PurchaseRecord,
  RewardRedemptionRecord,
} from '../../types/dashboard';
import type { RewardRedemptionApi } from '../../types/rewards';
import { saveDashboardSnapshot } from '../../utils/offlineStorage';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';

type FeedbackApi = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  category?: string | null;
  message: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type EventApi = {
  id: string;
  title: string;
  sub_header?: string | null;
  body: string;
  url?: string | null;
  created_at: string;
  updated_at?: string | null;
  rsvp?: {
    enabled: boolean;
    reward_points?: number | null;
    attendees?: {
      user_id: string;
      reward_redeemed_at?: string | null;
      reward_points_awarded?: number | null;
    }[] | null;
  } | null;
  links?: { label?: string | null; url?: string | null }[] | null;
  tags?: string[] | null;
};

type UserApi = {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'admin' | 'guest';
  rewardPoints: number;
  likedEvents: string[];
  profileImageUrl?: string | null;
  emailVerified?: boolean;
};

type PurchaseItemApi = {
  name?: string | null;
  price?: number | null;
  quantity?: number | null;
};

type PurchaseRecordApi = {
  id: string;
  userId: string;
  userEmail: string;
  shippingAddress: string;
  totalAmount: number;
  status: string;
  checkoutSessionId?: string | null;
  createdAt: string;
  items?: PurchaseItemApi[] | null;
};

// Formats date-time strings into a readable format for cards and tables.
const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  return date.toLocaleString();
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

// Produces a truncated snippet for longer descriptions.
const createSnippet = (value: string, limit = 140) => {
  const normalised = value.replace(/\s+/g, ' ').trim();
  if (normalised.length <= limit) {
    return normalised;
  }
  return `${normalised.slice(0, limit).trimEnd()}…`;
};

// Maps API feedback responses to UI records.
const mapFeedback = (api: FeedbackApi): FeedbackRecord => ({
  id: api.id,
  message: api.message,
  status: api.status,
  category: api.category ?? null,
  createdAt: api.created_at,
  updatedAt: api.updated_at,
});

// Maps API event responses to UI records.
const mapEvent = (api: EventApi, currentUserId?: string | null): EventRecord => {
  const attendees = Array.isArray(api.rsvp?.attendees) ? api.rsvp?.attendees : [];
  const attendeeRecord = currentUserId
    ? attendees.find((attendee) => attendee.user_id === currentUserId) ?? null
    : null;
  const attendanceConfirmedAt = attendeeRecord?.reward_redeemed_at ?? null;

  return {
    id: api.id,
    title: api.title,
    subHeader: api.sub_header ?? '',
    body: api.body,
    imageUrl: api.url ?? null,
    rewardPoints: api.rsvp?.reward_points ?? 0,
    createdAt: api.created_at,
    updatedAt: api.updated_at ?? null,
    attendanceConfirmed: Boolean(attendanceConfirmedAt),
    attendanceConfirmedAt,
    links: (api.links ?? [])
      .map((link) => ({
        label: (link?.label ?? '').trim(),
        url: (link?.url ?? '').trim(),
      }))
      .filter((link) => link.label && link.url),
    tags: Array.isArray(api.tags)
      ? api.tags
        .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
        .filter((tag) => Boolean(tag))
      : [],
  };
};

const mapRewardRedemption = (api: RewardRedemptionApi): RewardRedemptionRecord => ({
  id: api.id,
  rewardId: api.rewardId,
  rewardName: api.rewardName,
  rewardImageUrl: api.rewardImageUrl ?? null,
  pointsCost: api.pointsCost,
  userId: api.userId,
  userName: api.userName,
  token: api.token,
  status: api.status,
  createdAt: api.created_at,
  claimedAt: api.claimed_at ?? null,
});

const mapPurchaseRecord = (api: PurchaseRecordApi): PurchaseRecord => ({
  id: api.id,
  userId: api.userId,
  userEmail: api.userEmail,
  shippingAddress: api.shippingAddress,
  totalAmount: Number.isFinite(api.totalAmount) ? api.totalAmount : 0,
  status: api.status,
  checkoutSessionId: api.checkoutSessionId ?? null,
  createdAt: api.createdAt,
  items: Array.isArray(api.items)
    ? api.items.map((item) => ({
        name: typeof item?.name === 'string' && item.name.trim() ? item.name : 'Item',
        price: Number.isFinite(item?.price) ? Number(item?.price) : 0,
        quantity: Number.isFinite(item?.quantity) ? Math.max(1, Number(item?.quantity)) : 1,
      }))
    : [],
});

type EventRecommendationApi = {
  event: EventApi;
  score: number;
  reasons: string[];
};

type EventRecommendationsApiResponse = {
  recommendations: EventRecommendationApi[];
  usedFallback: boolean;
};

type RecommendedEvent = {
  event: EventRecord;
  score: number;
  reasons: string[];
};

type SelectedEventDetail = {
  event: EventRecord;
  reasons: string[];
};

// Derives a chip colour for feedback status labels.
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

const API = import.meta.env.VITE_BACKEND_API;

// Renders a consistent heading block for dashboard sections.
const SectionHeading = ({ title, description }: { title: string; description: string }) => (
  <Stack spacing={1} maxWidth={720}>
    <Typography variant="h4" component="h2">{title}</Typography>
    <Typography variant="body1" color="text.secondary">
      {description}
    </Typography>
  </Stack>
);

type DashboardTabPanelProps = {
  value: number;
  index: number;
  children: ReactNode;
};

const DashboardTabPanel = ({ value, index, children }: DashboardTabPanelProps) => (
  <Box
    role="tabpanel"
    hidden={value !== index}
    id={`dashboard-tabpanel-${index}`}
    aria-labelledby={`dashboard-tab-${index}`}
    sx={{ width: '100%' }}
  >
    {value === index ? <Box sx={{ pt: 3 }}>{children}</Box> : null}
  </Box>
);

// Summarises the student's engagement, rewards and RSVP activity.
const DashboardPage = () => {
  const { user, setUser } = useAuth();
  const userId = user?.id;
  const isAuthenticated = Boolean(userId);
  const isGuest = user?.role === 'guest';
  const [rewardPoints, setRewardPoints] = useState<number>(user?.rewardPoints ?? 0);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackRecord[]>([]);
  const [rsvpEvents, setRsvpEvents] = useState<EventRecord[]>([]);
  const [rewardRedemptions, setRewardRedemptions] = useState<RewardRedemptionRecord[]>([]);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendedEvents, setRecommendedEvents] = useState<RecommendedEvent[]>([]);
  const [selectedEventDetail, setSelectedEventDetail] = useState<SelectedEventDetail | null>(null);
  const [recommendationPage, setRecommendationPage] = useState(1);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);
  const [recommendationsFallback, setRecommendationsFallback] = useState(false);
  const [likeLoadingId, setLikeLoadingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const isOnline = useOnlineStatus();
  const likedEvents = useMemo(() => user?.likedEvents ?? [], [user?.likedEvents]);
  const likedEventsSet = useMemo(() => new Set(likedEvents), [likedEvents]);
  const likedEventsKey = useMemo(() => likedEvents.join('|'), [likedEvents]);

  useEffect(() => {
    if (!userId) {
      setRewardPoints(0);
      setFeedbackItems([]);
      setRsvpEvents([]);
      setRewardRedemptions([]);
      setPurchaseHistory([]);
      setError(null);
      saveDashboardSnapshot({
        updatedAt: new Date().toISOString(),
        rewardPoints: 0,
        feedbackItems: [],
        rsvpEvents: [],
        rewardRedemptions: [],
        purchaseHistory: [],
      });
      return;
    }

    setLoading(true);
    setError(null);

    void (async () => {
      const userUrl = `${API}/api/users/${userId}`;
      const feedbackUrl = `${API}/api/users/${userId}/feedback`;
      const rsvpUrl = `${API}/api/users/${userId}/rsvps`;
      const redemptionUrl = `${API}/api/users/${userId}/rewards/redemptions`;
      const purchasesUrl = `${API}/api/purchases/me`;

      try {
        const [
          userData,
          feedbackData,
          rsvpData,
          redemptionData,
          purchasesData,
        ] = await Promise.all([
          axios.get<UserApi>(userUrl).then((response) => response.data),
          axios.get<FeedbackApi[]>(feedbackUrl).then((response) => response.data),
          axios.get<EventApi[]>(rsvpUrl).then((response) => response.data),
          axios
            .get<RewardRedemptionApi[]>(redemptionUrl)
            .then((response) => response.data),
          isGuest
            ? Promise.resolve([] as PurchaseRecordApi[])
            : axios
              .get<PurchaseRecordApi[]>(purchasesUrl)
              .then((response) => response.data),
        ]);

        const rewardTotal = userData.rewardPoints ?? 0;
        const mappedFeedback = feedbackData.map(mapFeedback);
        const mappedRsvpEvents = rsvpData.map((event) => mapEvent(event, userId));
        const mappedRedemptions = redemptionData.map(mapRewardRedemption);
        const mappedPurchases = purchasesData.map(mapPurchaseRecord);

        setRewardPoints(rewardTotal);
        const normalisedUser = {
          ...userData,
          profileImageUrl: userData.profileImageUrl ?? null,
          emailVerified: userData.emailVerified ?? false,
        };
        setUser(normalisedUser);
        setFeedbackItems(mappedFeedback);
        setRsvpEvents(mappedRsvpEvents);
        setRewardRedemptions(mappedRedemptions);
        setPurchaseHistory(mappedPurchases);
        saveDashboardSnapshot({
          updatedAt: new Date().toISOString(),
          rewardPoints: rewardTotal,
          feedbackItems: mappedFeedback,
          rsvpEvents: mappedRsvpEvents,
          rewardRedemptions: mappedRedemptions,
          purchaseHistory: mappedPurchases,
        });
      } catch (err) {
        console.error('Failed to load dashboard data', err);
        const isNavigatorOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        setError(
          isNavigatorOffline
            ? 'You are offline. Your latest dashboard data could not be fetched.'
            : 'We could not load your latest engagement data. Please try again later.',
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [isGuest, setUser, userId]);

  const fetchRecommendations = useCallback(async () => {
    if (!userId) {
      setRecommendedEvents([]);
      return;
    }
    setRecommendationsLoading(true);
    setRecommendationsError(null);
    try {
      const { data } = await axios.get<EventRecommendationsApiResponse>(
        `${API}/api/users/${userId}/recommendations/events`,
        { params: { limit: 4 } },
      );
      const mapped = data.recommendations.map((entry) => ({
        event: mapEvent(entry.event, userId),
        score: entry.score,
        reasons: entry.reasons,
      }));
      setRecommendedEvents(mapped);
      setRecommendationsFallback(data.usedFallback);
    } catch (err) {
      console.error('Failed to load event recommendations', err);
      setRecommendedEvents([]);
      setRecommendationsFallback(false);
      setRecommendationsError('We could not personalise your event recommendations right now.');
    } finally {
      setRecommendationsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      setRecommendedEvents([]);
      setRecommendationsFallback(false);
      if (!isAuthenticated) {
        setRecommendationsError(null);
      }
      return;
    }
    if (!isOnline) {
      return;
    }
    setRecommendationsError(null);
    void fetchRecommendations();
  }, [fetchRecommendations, isAuthenticated, isOnline, userId, likedEventsKey]);

  const handleToggleLike = useCallback(
    async (eventId: string, liked: boolean) => {
      if (!user || !userId) {
        setRecommendationsError('Sign in to like events and refine your recommendations.');
        return;
      }
      if (user.role === 'guest') {
        setRecommendationsError('Guest accounts cannot like events.');
        return;
      }
      if (!isOnline) {
        setRecommendationsError('You are offline. Reconnect to update your liked events.');
        return;
      }
      setLikeLoadingId(eventId);
      try {
        if (liked) {
          const { data } = await axios.delete<UserApi>(`${API}/api/events/${eventId}/like`, {
            params: { userId },
          });
          setUser({
            ...data,
            profileImageUrl: data.profileImageUrl ?? null,
            emailVerified: data.emailVerified ?? false,
          });
        } else {
          const { data } = await axios.post<UserApi>(`${API}/api/events/${eventId}/like`, {
            userId,
          });
          setUser({
            ...data,
            profileImageUrl: data.profileImageUrl ?? null,
            emailVerified: data.emailVerified ?? false,
          });
        }
        setRecommendationsError(null);
      } catch (err) {
        console.error('Failed to update liked events', err);
        setRecommendationsError('We could not update your liked events. Please try again.');
      } finally {
        setLikeLoadingId(null);
      }
    },
    [isOnline, setUser, user, userId],
  );

  const highlightCards = useMemo(
    () => [
      {
        title: 'My Rewards',
        accent: isAuthenticated ? rewardPoints.toLocaleString() : '—',
        description: isAuthenticated
          ? 'Reward points available to redeem for exclusive Murdoch experiences and merchandise.'
          : 'Sign in to view your reward point balance.',
        actionLabel: isAuthenticated ? 'View rewards' : 'Sign in',
        actionHref: isAuthenticated ? '/rewards' : '/login',
      },
      {
        title: 'Scan QR Code',
        accent: 'Earn points instantly',
        description:
          'Attend events on campus and scan the QR code to add reward points to your profile in seconds.',
        actionLabel: isAuthenticated ? 'Open scanner' : 'Sign in',
        actionHref: isAuthenticated ? '/qr' : '/login',
      },
    ],
    [isAuthenticated, rewardPoints],
  );

  const handleTabChange = useCallback((_: SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  }, []);

  const handleOpenEventDetail = useCallback((event: EventRecord, reasons: string[] = []) => {
    setSelectedEventDetail({ event, reasons });
  }, []);

  const handleCloseEventDetail = useCallback(() => {
    setSelectedEventDetail(null);
  }, []);

  useEffect(() => {
    if (recommendedEvents.length === 0) {
      setRecommendationPage(1);
      return;
    }
    setRecommendationPage((prev) => {
      if (prev > recommendedEvents.length) {
        return recommendedEvents.length;
      }
      if (prev < 1) {
        return 1;
      }
      return prev;
    });
  }, [recommendedEvents.length]);

  const recommendationCount = recommendedEvents.length;
  const currentRecommendation = useMemo(() => {
    if (recommendationCount === 0) {
      return null;
    }
    const index = Math.min(Math.max(recommendationPage, 1), recommendationCount) - 1;
    return recommendedEvents[index] ?? null;
  }, [recommendationCount, recommendationPage, recommendedEvents]);

  const handleRecommendationPageChange = useCallback(
    (_event: ChangeEvent<unknown>, value: number) => {
      setRecommendationPage(value);
    },
    [],
  );

  const dashboardTabs = useMemo(
    () =>
      [
      {
        label: 'Recommended events',
        description: 'Discover opportunities tailored to Murdoch University students.',
        content: !isAuthenticated ? (
          <Alert severity="info">Sign in to unlock personalised event recommendations.</Alert>
        ) : !isOnline ? (
          <Alert severity="warning">
            You are offline. We&apos;ll refresh your recommendations once you reconnect.
          </Alert>
        ) : recommendationsError ? (
          <Alert severity="error">{recommendationsError}</Alert>
        ) : recommendationsLoading ? (
          <LinearProgress sx={{ maxWidth: 320 }} />
        ) : recommendedEvents.length === 0 ? (
          <Alert severity="info">
            Like events that catch your eye to tailor the recommendations you see here.
          </Alert>
        ) : (
          <Stack spacing={2} alignItems="stretch">
            {recommendationsFallback ? (
              <Alert severity="info">
                You&apos;re seeing popular events while we learn more about your interests.
              </Alert>
            ) : null}
            {currentRecommendation
              ? (() => {
                const liked = likedEventsSet.has(currentRecommendation.event.id);
                const likeTooltip = !user
                  ? 'Sign in to like events you are interested in.'
                  : isGuest
                    ? 'Guest accounts cannot like events.'
                    : !isOnline
                      ? 'Reconnect to update liked events.'
                      : liked
                        ? 'Remove your like from this event'
                        : 'Like this event';
                return (
                  <Card
                    key={currentRecommendation.event.id}
                    sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
                  >
                    {currentRecommendation.event.imageUrl ? (
                      <CardMedia
                        component="img"
                        image={currentRecommendation.event.imageUrl ?? undefined}
                        srcSet={`${currentRecommendation.event.imageUrl} 1x, ${currentRecommendation.event.imageUrl} 2x`}
                        sizes="(max-width: 600px) 100vw, 560px"
                        alt={
                          currentRecommendation.event.title
                            ? `${currentRecommendation.event.title} promotional visual`
                            : 'Event visual'
                        }
                        loading="lazy"
                        decoding="async"
                        sx={{ width: '100%', maxHeight: 260, objectFit: 'contain', backgroundColor: 'background.default' }}
                      />
                    ) : null}
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Stack spacing={0.75} maxWidth="80%">
                          <Typography variant="overline" color="text.secondary">
                            Recommended for you
                          </Typography>
                          <Typography variant="h5">{currentRecommendation.event.title}</Typography>
                          {currentRecommendation.event.subHeader ? (
                            <Typography variant="subtitle2" color="text.secondary">
                              {currentRecommendation.event.subHeader}
                            </Typography>
                          ) : null}
                        </Stack>
                        <Tooltip title={likeTooltip} placement="left">
                          <span>
                            <IconButton
                              color={liked ? 'primary' : 'default'}
                              disabled={
                                !user ||
                                isGuest ||
                                likeLoadingId === currentRecommendation.event.id ||
                                !isOnline
                              }
                              onClick={() =>
                                void handleToggleLike(currentRecommendation.event.id, liked)
                              }
                              size="large"
                              aria-label={
                                liked
                                  ? 'Remove like from recommended event'
                                  : 'Like recommended event'
                              }
                              aria-pressed={liked}
                            >
                              {likeLoadingId === currentRecommendation.event.id ? (
                                <CircularProgress size={20} color="inherit" aria-hidden="true" />
                              ) : liked ? (
                                <ThumbUpAltIcon color="primary" aria-hidden="true" focusable="false" />
                              ) : (
                                <ThumbUpOffAltIcon aria-hidden="true" focusable="false" />
                              )}
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {createSnippet(currentRecommendation.event.body)}
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip
                          label={`${currentRecommendation.event.rewardPoints} reward pts`}
                          color="primary"
                        />
                      </Stack>
                    </CardContent>
                    <CardActions sx={{ px: 3, pb: 3, pt: 0, mt: 'auto' }}>
                      <Button
                        size="small"
                        onClick={() =>
                          handleOpenEventDetail(currentRecommendation.event, currentRecommendation.reasons)
                        }
                      >
                        Read more
                      </Button>
                    </CardActions>
                  </Card>
                );
              })()
              : null}
            {recommendationCount > 1 ? (
              <Pagination
                count={recommendationCount}
                page={Math.min(recommendationPage, recommendationCount)}
                onChange={handleRecommendationPageChange}
                color="primary"
                sx={{ alignSelf: 'center' }}
              />
            ) : null}
          </Stack>
        ),
      },
      {
        label: 'PASS',
        description: 'View and manage your upcoming Peer Assisted Study Sessions.',
        content: <DashboardPassSection />,
      },
      {
        label: 'Rewards',
        description: 'Review your merchandise redemptions and QR codes.',
        content: !isAuthenticated ? (
          <Alert severity="info">Sign in to view your reward redemption history.</Alert>
        ) : loading ? (
          <LinearProgress sx={{ maxWidth: 320 }} />
        ) : rewardRedemptions.length === 0 ? (
          <Alert severity="info">
            You have not redeemed any rewards yet. Visit the rewards catalogue to get started.
          </Alert>
        ) : (
          <Stack spacing={2}>
            {rewardRedemptions.map((record) => {
              const qrUrl = `${API}/api/rewards/redemptions/${record.id}/qr.png`;
              const statusLabel = record.status === 'claimed' ? 'Claimed' : 'Unclaimed';
              const statusColor = record.status === 'claimed' ? 'success' : 'warning';
              return (
                <Card key={record.id}>
                  {record.rewardImageUrl ? (
                    <CardMedia
                      component="img"
                      image={record.rewardImageUrl}
                      alt={record.rewardName}
                      sx={{ height: 200, objectFit: 'cover' }}
                    />
                  ) : null}
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <Stack spacing={0.5}>
                        <Typography variant="overline" color="text.secondary">
                          Reward redemption
                        </Typography>
                        <Typography variant="h5">{record.rewardName}</Typography>
                      </Stack>
                      <Chip label={statusLabel} color={statusColor as 'success' | 'warning'} />
                    </Stack>
                    <Stack spacing={1.5} sx={{ mt: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        Redeemed {formatDateTime(record.createdAt)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Points spent: {record.pointsCost.toLocaleString()}
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        Token: {record.token}
                      </Typography>
                      {record.status === 'claimed' ? (
                        <Typography variant="body2" color="success.main">
                          Claimed {formatDateTime(record.claimedAt)}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="warning.main">
                          Present this QR code on campus to collect your reward.
                        </Typography>
                      )}
                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={2}
                        alignItems={{ sm: 'center' }}
                      >
                        <Box
                          component="img"
                          src={qrUrl}
                          alt={`${record.rewardName} QR code`}
                          sx={{
                            width: 160,
                            height: 160,
                            objectFit: 'contain',
                            borderRadius: 2,
                            border: (theme) => `1px solid ${theme.palette.divider}`,
                            backgroundColor: 'common.white',
                          }}
                        />
                        <Stack spacing={1} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
                          <Button
                            variant="contained"
                            component="a"
                            href={qrUrl}
                            target="_blank"
                            rel="noopener"
                          >
                            Open QR code
                          </Button>
                          <Button
                            variant="outlined"
                            onClick={() => {
                              if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                                void navigator.clipboard.writeText(record.token).catch(() => {
                                  window.alert('Unable to copy the token automatically.');
                                });
                              } else {
                                window.prompt('Reward token', record.token);
                              }
                            }}
                          >
                            Copy token
                          </Button>
                        </Stack>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        ),
      },
      {
        label: 'My RSVP events',
        description: 'See the events you have reserved a spot for and the reward points they offer.',
        content: !isAuthenticated ? (
          <Alert severity="info">Sign in to start RSVP&apos;ing to events and track them here.</Alert>
        ) : loading ? (
          <LinearProgress sx={{ maxWidth: 320 }} />
        ) : rsvpEvents.length === 0 ? (
          <Alert severity="info">
            You have not RSVP&apos;ed for any events yet. Browse the events page to secure your spot.
          </Alert>
        ) : (
          <Stack spacing={2}>
            <Box
              sx={{
                display: 'grid',
                gap: 3,
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
              }}
            >
              {rsvpEvents.map((event) => (
                <Card key={event.id} sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <Stack spacing={0.75} maxWidth="80%">
                        <Typography variant="overline" color="text.secondary">
                          RSVP saved
                        </Typography>
                        <Typography variant="h5">{event.title}</Typography>
                        {event.subHeader ? (
                          <Typography variant="subtitle2" color="text.secondary">
                            {event.subHeader}
                          </Typography>
                        ) : null}
                      </Stack>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {createSnippet(event.body)}
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip label={`${event.rewardPoints} reward pts`} color="primary" />
                      {event.attendanceConfirmed ? (
                        <Chip
                          label={`Attendance confirmed ${formatDateTime(event.attendanceConfirmedAt)}`}
                          color="success"
                        />
                      ) : (
                        <Chip label="Awaiting attendance scan" color="info" variant="outlined" />
                      )}
                    </Stack>
                  </CardContent>
                  <CardActions sx={{ px: 3, pb: 3, pt: 0, mt: 'auto' }}>
                    <Button size="small" onClick={() => handleOpenEventDetail(event)}>
                      Read more
                    </Button>
                  </CardActions>
                </Card>
              ))}
            </Box>
          </Stack>
        ),
      },
      {
        label: 'My feedback',
        description: 'Track the status of the feedback you have shared with the MUSEngage team.',
        content: !isAuthenticated ? (
          <Alert severity="info">Sign in to view the progress of your feedback submissions.</Alert>
        ) : loading ? (
          <LinearProgress sx={{ maxWidth: 320 }} />
        ) : feedbackItems.length === 0 ? (
          <Alert severity="info">You have not submitted any feedback yet.</Alert>
        ) : (
          <Stack spacing={2}>
            {feedbackItems.map((feedback) => (
              <Card key={feedback.id}>
                <CardContent>
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip label={feedback.status} color={getFeedbackStatusColor(feedback.status)} />
                      <Chip label={`Updated ${formatDateTime(feedback.updatedAt)}`} variant="outlined" />
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
        ),
      },
      {
        label: 'Purchase history',
        description: 'Review your recent merchandise orders and delivery details.',
        content: !isAuthenticated ? (
          <Alert severity="info">Sign in to view your purchase history.</Alert>
        ) : loading ? (
          <LinearProgress sx={{ maxWidth: 320 }} />
        ) : purchaseHistory.length === 0 ? (
          <Alert severity="info">No purchases recorded yet. Visit the shop to place your first order.</Alert>
        ) : (
          <Stack spacing={2}>
            {purchaseHistory.map((purchase) => (
              <Card key={purchase.id}>
                <CardContent>
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip label={purchase.status} color={purchase.status === 'completed' ? 'success' : 'info'} />
                      <Chip label={`Placed ${formatDateTime(purchase.createdAt)}`} variant="outlined" />
                      <Chip label={`Total ${formatCurrency(purchase.totalAmount)}`} color="primary" />
                    </Stack>
                    <Typography variant="subtitle2">Shipping to</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                      {purchase.shippingAddress}
                    </Typography>
                    <Stack spacing={1}>
                      <Typography variant="subtitle2">Items</Typography>
                      <Stack spacing={0.75}>
                        {purchase.items.map((item, index) => (
                          <Stack
                            key={`${purchase.id}-item-${index}`}
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
                    {purchase.checkoutSessionId ? (
                      <Typography variant="caption" color="text.secondary">
                        Checkout reference: {purchase.checkoutSessionId}
                      </Typography>
                    ) : null}
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        ),
      },
    ].filter((tab) => !(isGuest && tab.label === 'Purchase history')),
    [
      feedbackItems,
      handleToggleLike,
      isAuthenticated,
      isGuest,
      isOnline,
      purchaseHistory,
      likedEventsSet,
      likeLoadingId,
      loading,
      recommendationsError,
      recommendationsFallback,
      recommendationsLoading,
      handleOpenEventDetail,
      handleRecommendationPageChange,
      currentRecommendation,
      recommendationCount,
      recommendationPage,
      recommendedEvents,
      rewardRedemptions,
      rsvpEvents,
      user,
    ],
  );

  return (
    <>
      <Seo
        title="Dashboard — MUSEngage"
        description="Review your event RSVPs, recommendations and rewards to stay engaged with the Murdoch University community."
        canonical="https://musengage.site/dashboard"
      />
      <Box>
        <PageHero
          eyebrow="Murdoch University"
          title="Engagement Dashboard"
          description="Stay connected with the latest events, rewards and experiences curated for Murdoch students."
          theme="dashboard"
          ctaLabel="Browse upcoming events"
          ctaHref="/events"
        />

        <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
          <Stack spacing={8}>
            {error ? (
              <Alert severity="error">
                {error}
                {!isOnline ? (
                  <Button component={NavLink} to="/offline" color="inherit" sx={{ ml: 2 }}>
                    View offline data
                  </Button>
                ) : null}
              </Alert>
            ) : null}

            <Stack spacing={3}>
              <SectionHeading
                title="Track your engagement"
                description="Quick actions to help you stay active within the MUSEngage community."
              />
              <Box
                sx={{
                  display: 'grid',
                  gap: 3,
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                }}
              >
                {highlightCards.map((item) => (
                  <Card
                    key={item.title}
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      background: (theme) =>
                        `linear-gradient(135deg, ${alpha(theme.palette.secondary.light, 0.25)}, ${alpha(theme.palette.primary.light, 0.2)})`,
                    }}
                  >
                    <CardContent>
                      <Typography variant="overline" color="text.secondary">
                        {item.title}
                      </Typography>
                      <Typography variant="h3" color="primary.main" sx={{ mt: 1 }}>
                        {item.accent}
                      </Typography>
                      <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
                        {item.description}
                      </Typography>
                    </CardContent>
                    <CardActions sx={{ px: 3, pb: 3, pt: 0, mt: 'auto' }}>
                      <Button
                        component={NavLink}
                        to={item.actionHref}
                        variant="contained"
                        color="primary"
                        size="large"
                      >
                        {item.actionLabel}
                      </Button>
                    </CardActions>
                  </Card>
                ))}
              </Box>
            </Stack>

            <Stack spacing={3}>
              <SectionHeading
                title={dashboardTabs[activeTab]?.label ?? ''}
                description={dashboardTabs[activeTab]?.description ?? ''}
              />
              <Tabs
                value={activeTab}
                onChange={handleTabChange}
                variant="scrollable"
                allowScrollButtonsMobile
                aria-label="Dashboard engagement tabs"
                sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
              >
                {dashboardTabs.map((tab, index) => (
                  <Tab key={tab.label} label={tab.label} id={`dashboard-tab-${index}`} aria-controls={`dashboard-tabpanel-${index}`} />
                ))}
              </Tabs>
              {dashboardTabs.map((tab, index) => (
                <DashboardTabPanel key={tab.label} value={activeTab} index={index}>
                  {tab.content}
                </DashboardTabPanel>
              ))}
            </Stack>
          </Stack>
        </Container>

        <Dialog
          open={Boolean(selectedEventDetail)}
          onClose={handleCloseEventDetail}
          maxWidth="sm"
          fullWidth
          aria-labelledby="recommended-event-dialog"
        >
          {selectedEventDetail ? (
            <>
              <DialogTitle id="recommended-event-dialog">{selectedEventDetail.event.title}</DialogTitle>
              <DialogContent dividers>
                <Stack spacing={2}>
                  {selectedEventDetail.event.imageUrl ? (
                    <Box
                      component="img"
                      src={selectedEventDetail.event.imageUrl}
                      srcSet={`${selectedEventDetail.event.imageUrl} 1x, ${selectedEventDetail.event.imageUrl} 2x`}
                      alt={
                        selectedEventDetail.event.title
                          ? `${selectedEventDetail.event.title} promotional visual`
                          : 'Event visual'
                      }
                      loading="lazy"
                      decoding="async"
                      style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 16, backgroundColor: '#1a1a1a' }}
                    />
                  ) : null}
                  {selectedEventDetail.event.subHeader ? (
                    <Typography variant="subtitle1" color="text.secondary">
                      {selectedEventDetail.event.subHeader}
                    </Typography>
                  ) : null}
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                    {selectedEventDetail.event.body}
                  </Typography>
                  {selectedEventDetail.event.tags.length > 0 ? (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {selectedEventDetail.event.tags.map((tag) => (
                        <Chip key={`${selectedEventDetail.event.id}-dialog-tag-${tag}`} label={tag} size="small" />
                      ))}
                    </Stack>
                  ) : null}
                  {selectedEventDetail.reasons.length > 0 ? (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {selectedEventDetail.reasons.map((reason, index) => (
                        <Chip
                          key={`${selectedEventDetail.event.id}-dialog-reason-${index}`}
                          label={reason}
                          color="secondary"
                          variant="outlined"
                          size="small"
                        />
                      ))}
                    </Stack>
                  ) : null}
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip label={`${selectedEventDetail.event.rewardPoints} reward pts`} color="primary" />
                    <Chip
                      label={`Updated ${formatDateTime(selectedEventDetail.event.updatedAt)}`}
                      variant="outlined"
                    />
                  </Stack>
                </Stack>
              </DialogContent>
              <DialogActions>
                <Button onClick={handleCloseEventDetail}>Close</Button>
                <Button component={NavLink} to="/events" variant="contained" onClick={handleCloseEventDetail}>
                  View events
                </Button>
              </DialogActions>
            </>
          ) : null}
        </Dialog>
      </Box>
    </>
  );
};

export default DashboardPage;
