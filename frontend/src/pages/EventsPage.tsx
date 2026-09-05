import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardMedia,
  Collapse,
  Container,
  List,
  ListItem,
  ListItemText,
  Link,
  Chip,
  Stack,
  IconButton,
  Tooltip,
  CircularProgress,
  InputAdornment,
  Pagination,
  TextField,
  Typography,
} from '@mui/material';
import PageHero from '../components/PageHero';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { User } from '../context/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import SearchIcon from '@mui/icons-material/Search';
import { Helmet } from 'react-helmet-async';

const API = import.meta.env.VITE_BACKEND_API;

type EventData = {
  id: string;
  title: string;
  sub_header?: string | null;
  body: string;
  url?: string;
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

const PREVIEW_LIMIT = 200;

// Collapses whitespace to make event descriptions easier to preview.
const normaliseBody = (value: string) => value.replace(/\s+/g, ' ').trim();

// Generates a short preview for long event descriptions.
const createPreview = (body: string) => {
  const normalised = normaliseBody(body);
  if (normalised.length <= PREVIEW_LIMIT) {
    return normalised;
  }

  return `${normalised.slice(0, PREVIEW_LIMIT).trimEnd()}…`;
};

// Splits descriptions into multiple preview paragraphs without truncating words abruptly.
const createPreviewSegments = (body: string): string[] => {
  const segments = body
    .split(/\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return [createPreview(body)];
  }

  const previewSegments: string[] = [];
  let usedCharacters = 0;

  for (const segment of segments) {
    const normalisedSegment = normaliseBody(segment);
    if (usedCharacters + normalisedSegment.length <= PREVIEW_LIMIT) {
      previewSegments.push(normalisedSegment);
      usedCharacters += normalisedSegment.length;
      continue;
    }

    const remaining = PREVIEW_LIMIT - usedCharacters;
    if (remaining > 0) {
      previewSegments.push(`${normalisedSegment.slice(0, Math.max(remaining - 1, 0)).trimEnd()}…`);
    } else if (previewSegments.length === 0) {
      previewSegments.push(createPreview(segment));
    }
    break;
  }

  if (previewSegments.length === 0) {
    previewSegments.push(createPreview(body));
  }

  return previewSegments;
};

const bodyTextSx = { textAlign: 'justify' } as const;

// Formats event dates for readability.
const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  return date.toLocaleString();
};

// Renders rich text content (paragraphs and lists) from event descriptions.
const renderBodyContent = (body: string, eventId: string): JSX.Element[] => {
  const segments = body
    .split(/\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const nodes: JSX.Element[] = [];
  let listItems: string[] = [];
  let listIndex = 0;

  const pushList = () => {
    if (listItems.length === 0) {
      return;
    }

    const currentList = listItems;
    const currentIndex = listIndex;
    nodes.push(
      <List key={`${eventId}-list-${currentIndex}`} sx={{ pl: 2 }}>
        {currentList.map((item, itemIndex) => (
          <ListItem key={`${eventId}-list-${currentIndex}-item-${itemIndex}`} sx={{ py: 0 }}>
            <ListItemText
              primaryTypographyProps={{ variant: 'body2', sx: bodyTextSx }}
              primary={item}
            />
          </ListItem>
        ))}
      </List>,
    );
    listItems = [];
    listIndex += 1;
  };

  segments.forEach((segment, index) => {
    if (/^[-•]/.test(segment)) {
      listItems.push(segment.replace(/^[-•]\s*/, ''));
      return;
    }

    pushList();
    nodes.push(
      <Typography key={`${eventId}-paragraph-${index}`} variant="body2" paragraph sx={bodyTextSx}>
        {segment}
      </Typography>,
    );
  });

  pushList();

  if (nodes.length === 0) {
    nodes.push(
      <Typography key={`${eventId}-fallback`} variant="body2" sx={bodyTextSx}>
        {body}
      </Typography>,
    );
  }

  return nodes;
};

// Shows upcoming events and lets students RSVP.
const EventsPage = () => {
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const { user, setUser } = useAuth();
  const [rsvpLoadingId, setRsvpLoadingId] = useState<string | null>(null);
  const [likeLoadingId, setLikeLoadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const isOnline = useOnlineStatus();
  const likedEvents = useMemo(() => user?.likedEvents ?? [], [user?.likedEvents]);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const EVENTS_PER_PAGE = 6;

  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [events],
  );

  const processedEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return sortedEvents;
    }
    return sortedEvents.filter((event) => event.title.toLowerCase().includes(query));
  }, [sortedEvents, searchQuery]);

  const pageCount = Math.max(1, Math.ceil(processedEvents.length / EVENTS_PER_PAGE));
  const paginatedEvents = useMemo(
    () =>
      processedEvents.slice(
        (page - 1) * EVENTS_PER_PAGE,
        (page - 1) * EVENTS_PER_PAGE + EVENTS_PER_PAGE,
      ),
    [processedEvents, page],
  );
  const likedEventsSet = useMemo(() => new Set(likedEvents), [likedEvents]);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const { data } = await axios.get<EventData[]>(`${API}/api/events`);
        setEvents(data);
      } catch (err) {
        console.error('Error fetching events:', err);
        setError("We couldn't load events right now. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, sortedEvents]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, pageCount));
  }, [pageCount]);

  // Sends an RSVP request for the specified event.
  async function handleRsvp(eventId: string) {
    if (!user) {
      setToast({ type: 'error', message: 'Please sign in to RSVP for events.' });
      return;
    }

    if (user.role === 'guest') {
      setToast({ type: 'error', message: 'Guest access cannot RSVP for events.' });
      return;
    }

    if (!isOnline) {
      setToast({ type: 'error', message: 'You are offline. Reconnect to RSVP for events.' });
      return;
    }

    setRsvpLoadingId(eventId);
    setToast(null);

    try {
      const { data } = await axios.post<EventData>(`${API}/api/events/${eventId}/rsvp`, {
        userId: user.id,
      });
      setEvents((prev) => prev.map((event) => (event.id === data.id ? data : event)));
      setToast({ type: 'success', message: 'RSVP confirmed! See the event in your dashboard.' });
    } catch (err) {
      console.error('Failed to RSVP for event:', err);
      setToast({ type: 'error', message: 'Unable to RSVP right now. Please try again later.' });
    } finally {
      setRsvpLoadingId(null);
    }
  }

  async function handleToggleLike(eventId: string) {
    if (!user) {
      setToast({ type: 'error', message: 'Sign in to like events you are interested in.' });
      return;
    }
    if (user.role === 'guest') {
      setToast({ type: 'error', message: 'Guest access cannot like events.' });
      return;
    }
    if (!isOnline) {
      setToast({ type: 'error', message: 'You are offline. Reconnect to update liked events.' });
      return;
    }

    const liked = likedEventsSet.has(eventId);
    setLikeLoadingId(eventId);

    try {
      if (liked) {
        const { data } = await axios.delete<User>(`${API}/api/events/${eventId}/like`, {
          params: { userId: user.id },
        });
        setUser(data);
        setToast({ type: 'success', message: 'Event removed from your likes.' });
      } else {
        const { data } = await axios.post<User>(`${API}/api/events/${eventId}/like`, {
          userId: user.id,
        });
        setUser(data);
        setToast({ type: 'success', message: 'Event added to your likes.' });
      }
    } catch (err) {
      console.error('Failed to toggle like for event:', err);
      setToast({ type: 'error', message: 'Unable to update your liked events right now.' });
    } finally {
      setLikeLoadingId(null);
    }
  }

  return (
    <>
      <Helmet>
        <title>MUSEngage | Upcoming events</title>
        <meta
          name="description"
          content="Discover and RSVP for upcoming Murdoch University events, workshops and community activities."
        />
      </Helmet>
      <Box>
      <PageHero
        eyebrow="Murdoch University"
        title="Events at Murdoch"
        description="Join workshops, seminars and experiences curated for the Murdoch community."
        theme="events"
      />

      <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
        <Stack spacing={3}>
          {toast ? (
            <Alert severity={toast.type} onClose={() => setToast(null)}>
              {toast.message}
            </Alert>
          ) : null}
          <Stack spacing={1} maxWidth={640}>
            <Typography variant="h4" component="h2">Featured events</Typography>
            <Typography variant="body1" color="text.secondary">
              Secure your spot and make the most of every opportunity.
            </Typography>
          </Stack>

          {loading && (
            <Typography variant="body1" color="text.secondary">
              Loading events...
            </Typography>
          )}

          {error && !loading && <Alert severity="error">{error}</Alert>}

          {!loading && !error && events.length === 0 && (
            <Alert severity="info">No events are scheduled right now. Check back soon.</Alert>
          )}

          {!loading && !error && events.length > 0 && (
            <Stack spacing={3}>
              <TextField
                label="Search events"
                placeholder="Search by title"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                fullWidth
              />

              {processedEvents.length === 0 ? (
                <Alert severity="info">No events match your search.</Alert>
              ) : (
                <Stack spacing={3}>
                  {paginatedEvents.map((event) => {
                    const isExpanded = expandedEventId === event.id;
                    const rewardPoints = event.rsvp?.reward_points ?? 0;
                    const userHasRsvped = Boolean(
                      user && event.rsvp?.attendees?.some((attendee) => attendee.user_id === user.id),
                    );
                    const attendeeRecord = user
                      ? event.rsvp?.attendees?.find((attendee) => attendee.user_id === user.id) ?? null
                      : null;
                    const attendanceConfirmed = Boolean(attendeeRecord?.reward_redeemed_at);
                    const eventLinks = (event.links ?? [])
                      .map((link) => ({
                        label: (link?.label ?? '').trim(),
                        url: (link?.url ?? '').trim(),
                      }))
                      .filter((link) => link.label && link.url);
                    const liked = likedEventsSet.has(event.id);
                    const isGuest = user?.role === 'guest';
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
                      key={event.id}
                      sx={{
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                    {event.url ? (
                      <CardMedia
                        component="img"
                        image={event.url}
                        srcSet={`${event.url} 1x, ${event.url} 2x`}
                        sizes="(max-width: 600px) 100vw, 600px"
                        alt={event.title ? `${event.title} promotional visual` : 'Event visual'}
                        loading="lazy"
                        decoding="async"
                        width={600}
                        height={320}
                        sx={{ width: '100%', maxHeight: 320, objectFit: 'contain', backgroundColor: 'background.default', borderRadius: 2 }}
                      />
                    ) : null}
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Stack spacing={0.5} sx={{ pr: 1 }}>
                          <Typography variant="overline" color="text.secondary">
                            {formatDate(event.created_at)}
                          </Typography>
                          <Typography variant="h5">{event.title}</Typography>
                          {event.sub_header ? (
                            <Typography variant="subtitle1" color="text.secondary">
                              {event.sub_header}
                            </Typography>
                          ) : null}
                        </Stack>
                        <Tooltip title={likeTooltip} placement="left">
                          <span>
                            <IconButton
                              color={liked ? 'primary' : 'default'}
                              disabled={!user || isGuest || likeLoadingId === event.id || !isOnline}
                              onClick={() => void handleToggleLike(event.id)}
                              size="large"
                              aria-label={liked ? `Unlike ${event.title}` : `Like ${event.title}`}
                            >
                              {likeLoadingId === event.id ? (
                                <CircularProgress size={20} color="inherit" />
                              ) : liked ? (
                                <ThumbUpAltIcon color="primary" />
                              ) : (
                                <ThumbUpOffAltIcon />
                              )}
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                      <Box sx={{ mt: 2 }}>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Stack spacing={1.5}>{renderBodyContent(event.body, event.id)}</Stack>
                        </Collapse>
                        <Collapse in={!isExpanded} timeout="auto" unmountOnExit>
                          <Stack spacing={1.5}>
                            {createPreviewSegments(event.body).map((segment, index) => (
                              <Typography
                                key={`${event.id}-preview-${index}`}
                                variant="body2"
                                color="text.secondary"
                                sx={bodyTextSx}
                              >
                                {segment}
                              </Typography>
                            ))}
                          </Stack>
                        </Collapse>
                      </Box>
                      {event.rsvp?.enabled ? (
                        <Stack
                          direction={{ xs: 'column', sm: 'row' }}
                          spacing={1}
                          alignItems={{ xs: 'flex-start', sm: 'center' }}
                        >
                          <Chip label={`${rewardPoints} reward pts`} color="primary" size="small" sx={{ fontWeight: 600 }} />
                          {userHasRsvped ? (
                            attendanceConfirmed ? (
                              <Chip
                                label={`Attendance confirmed ${formatDateTime(attendeeRecord?.reward_redeemed_at ?? null)}`}
                                color="success"
                                size="small"
                              />
                            ) : (
                              <Chip label="RSVP confirmed" color="secondary" size="small" />
                            )
                          ) : null}
                          {userHasRsvped && !attendanceConfirmed ? (
                            <Chip label="Awaiting attendance scan" color="info" variant="outlined" size="small" />
                          ) : null}
                        </Stack>
                      ) : null}
                      {eventLinks.length > 0 ? (
                        <Stack spacing={0.5} sx={{ mt: 2 }}>
                          <Typography variant="subtitle2">Event links</Typography>
                          <Stack spacing={0.5}>
                            {eventLinks.map((link, index) => (
                              <Link key={`${event.id}-link-${index}`} href={link.url} target="_blank" rel="noreferrer">
                                {link.label}
                              </Link>
                            ))}
                          </Stack>
                        </Stack>
                      ) : null}
                    </CardContent>
                    <CardActions sx={{ px: 3, pb: 3, pt: 0 }}>
                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1.5}
                        alignItems={{ xs: 'stretch', sm: 'center' }}
                        sx={{ width: '100%' }}
                      >
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                          <Button
                            variant="text"
                            color="primary"
                            onClick={() =>
                              setExpandedEventId((current) => (current === event.id ? null : event.id))
                            }
                            sx={{ width: { xs: '100%', sm: 'auto' } }}
                          >
                            {isExpanded ? 'Show less' : 'Read more'}
                          </Button>
                          {event.rsvp?.enabled ? (
                            user ? (
                              <Button
                                variant={userHasRsvped ? 'contained' : 'outlined'}
                                color={userHasRsvped ? 'success' : 'primary'}
                                onClick={() => void handleRsvp(event.id)}
                                disabled={
                                  isGuest || !isOnline || userHasRsvped || rsvpLoadingId === event.id
                                }
                                startIcon={userHasRsvped ? <CheckCircleIcon fontSize="small" /> : undefined}
                                sx={{ width: { xs: '100%', sm: 'auto' } }}
                              >
                                {isGuest
                                  ? 'RSVP unavailable for guests'
                                  : userHasRsvped
                                    ? 'RSVP saved'
                                    : rsvpLoadingId === event.id
                                      ? 'RSVPing…'
                                      : 'RSVP'}
                              </Button>
                            ) : (
                              <Button
                                component={NavLink}
                                to="/login"
                                variant="contained"
                                color="primary"
                                sx={{ width: { xs: '100%', sm: 'auto' } }}
                              >
                                Sign in to RSVP
                              </Button>
                            )
                          ) : null}
                        </Stack>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ ml: { xs: 0, sm: 'auto' }, textAlign: { xs: 'left', sm: 'right' } }}
                        >
                          Posted {formatDate(event.created_at)}
                        </Typography>
                      </Stack>
                    </CardActions>
                    </Card>
                  );
                })}
                </Stack>
              )}
              {processedEvents.length > 0 && pageCount > 1 ? (
                <Pagination
                  count={pageCount}
                  page={page}
                  onChange={(_event, value) => setPage(value)}
                  color="primary"
                  sx={{ alignSelf: 'center' }}
                />
              ) : null}
            </Stack>
          )}
        </Stack>
      </Container>
      </Box>
    </>
  );
};

export default EventsPage;
