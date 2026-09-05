import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import axios from 'axios';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Fab,
  FormControlLabel,
  FormHelperText,
  Chip,
  Collapse,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  LinearProgress,
  Divider,
  IconButton,
  Pagination,
  Link,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import AddIcon from '@mui/icons-material/Add';
import DownloadIcon from '@mui/icons-material/Download';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import PageHero from '../components/PageHero';
import { useAuth } from '../context/AuthContext';
import { Helmet } from 'react-helmet-async';
import { Link as RouterLink } from 'react-router-dom';
import type { RewardApi, RewardRecord } from '../types/rewards';

const API = import.meta.env.VITE_BACKEND_API;

interface AdminRequestErrorOptions {
  forbiddenMessage?: string;
  unauthorizedMessage?: string;
}

function showAdminRequestError(
  error: unknown,
  fallbackMessage: string,
  options: AdminRequestErrorOptions = {},
): void {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 403 && options.forbiddenMessage) {
      alert(options.forbiddenMessage);
      return;
    }
    if (status === 401 && options.unauthorizedMessage) {
      alert(options.unauthorizedMessage);
      return;
    }
    const responseData = error.response?.data;
    if (responseData && typeof responseData === 'object') {
      const detail = (responseData as { detail?: unknown }).detail;
      if (typeof detail === 'string' && detail.trim()) {
        alert(detail);
        return;
      }
    }
  }
  alert(fallbackMessage);
}

type RsvpQrCodePreviewProps = {
  imageUrl: string | null;
  size?: number;
  downloadName?: string;
};

const RsvpQrCodePreview = ({ imageUrl, size = 128, downloadName }: RsvpQrCodePreviewProps) => {
  if (!imageUrl) {
    return (
      <Box sx={{ maxWidth: size }}>
        <Typography variant="body2" color="text.secondary">
          QR code not available yet. Save the event and refresh the page if this persists.
        </Typography>
      </Box>
    );
  }

  const fileName = downloadName && downloadName.trim() ? downloadName.trim() : 'event-rsvp-qr.png';

  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl, { mode: 'cors' });
      if (!response.ok) {
        throw new Error(`Failed to download QR code: ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Unable to download RSVP QR code', error);
      }
      try {
        window.open(imageUrl, '_blank');
      } catch (openError) {
        if (import.meta.env.DEV) {
          console.error('Unable to open QR code fallback', openError);
        }
      }
    }
  };

  return (
    <Box>
      <Stack spacing={1.5} alignItems="flex-start">
        <Box
          component="img"
          src={imageUrl}
          alt="Event RSVP QR code"
          sx={{
            width: size,
            height: size,
            imageRendering: 'pixelated',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.paper',
          }}
        />
        <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={() => void handleDownload()}>
          Download PNG
        </Button>
      </Stack>
    </Box>
  );
};

type EventRsvpAttendeeApi = {
  user_id: string;
  user_name: string;
  user_email: string;
  rsvp_at: string;
  reward_redeemed_at?: string | null;
  reward_points_awarded?: number | null;
};

type EventRsvpApi = {
  enabled: boolean;
  key?: string | null;
  reward_points?: number | null;
  attendees?: EventRsvpAttendeeApi[] | null;
  qr_code_url?: string | null;
};

type EventLinkApi = {
  label?: string | null;
  url?: string | null;
};

type EventApi = {
  id: string;
  title: string;
  sub_header?: string | null;
  body: string;
  url?: string | null;
  created_at: string;
  updated_at?: string | null;
  rsvp?: EventRsvpApi | null;
  links?: EventLinkApi[] | null;
  tags?: string[] | null;
};

type EventRsvpAttendee = {
  userId: string;
  userName: string;
  userEmail: string;
  rsvpAt: string;
  rewardRedeemedAt: string | null;
  rewardPointsAwarded: number | null;
};

type EventLinkRecord = {
  label: string;
  url: string;
};

type EventRecord = {
  id: string;
  title: string;
  subHeader: string;
  body: string;
  url: string | null;
  createdAt: string;
  updatedAt: string | null;
  hasRsvp: boolean;
  rsvpKey: string | null;
  rsvpQrCodeUrl: string | null;
  rsvpRewardPoints: number;
  rsvpAttendees: EventRsvpAttendee[];
  links: EventLinkRecord[];
  tags: string[];
};

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

type FeedbackRecord = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  category: string | null;
  message: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type ItemApi = {
  id: string;
  name: string;
  description: string;
  availabilityCount: number;
  price: number;
  url?: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRecord = {
  id: string;
  name: string;
  description: string;
  availabilityCount: number;
  price: number;
  url: string | null;
  createdAt: string;
  updatedAt: string;
};

type UserRecord = {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'admin';
  rewardPoints: number;
};

type PostComment = {
  id: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  content: string;
  createdAt: string;
};

type PostRecord = {
  id: string;
  title: string;
  content: string;
  flair?: string | null;
  imageUrl?: string | null;
  authorName: string;
  authorEmail: string;
  createdAt: string;
  updatedAt?: string | null;
  comments: PostComment[];
};

type ModerationRecord = {
  id: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  title: string;
  content: string;
  flair?: string | null;
  imageUrl?: string | null;
  submittedAt: string;
  reason: string;
  categories: string[];
  status: 'pending_review' | 'approved' | 'rejected';
  decidedAt?: string | null;
  decidedBy?: string | null;
  decidedByName?: string | null;
  adminNote?: string | null;
  postId?: string | null;
};

type PollOptionResult = {
  option: string;
  votes: number;
};

type PollApi = {
  id: string;
  question: string;
  options: string[];
  imageUrl?: string | null;
  isFinalized: boolean;
  rewardPoints: number;
  rewardPointsAwarded: boolean;
  created_at: string;
  updated_at: string;
  finalized_at?: string | null;
  results?: PollOptionResult[] | null;
  totalVotes: number;
};

type PollRecord = {
  id: string;
  question: string;
  options: string[];
  imageUrl: string | null;
  isFinalized: boolean;
  rewardPoints: number;
  rewardPointsAwarded: boolean;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  results: PollOptionResult[] | null;
  totalVotes: number;
};

type CompetitionSubmissionRecord = {
  id: string;
  content: string;
  submittedAt: string;
  updatedAt?: string | null;
  participantId?: string | null;
};

type CompetitionApi = {
  id: string;
  title: string;
  summary: string;
  details: string;
  imageUrl?: string | null;
  isActive: boolean;
  created_at: string;
  updated_at: string;
  submissionCount: number;
  userSubmission?: CompetitionSubmissionRecord | null;
};

type CompetitionRecord = {
  id: string;
  title: string;
  summary: string;
  details: string;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  submissionCount: number;
  userSubmission: CompetitionSubmissionRecord | null;
};

type UploadResponse = {
  ok?: boolean;
  url?: string;
  blobUrl?: string;
};

const createEmptyEventLink = (): EventLinkRecord => ({ label: '', url: '' });

const EVENT_TAG_OPTIONS = [
  'Career development',
  'Community & networking',
  'Industry connections',
  'Academic support',
  'Wellbeing',
  'Innovation & tech',
  'Sustainability',
];

const MAX_EVENT_TAGS = 6;

function mapEvent(api: EventApi): EventRecord {
  const attendees: EventRsvpAttendee[] = (api.rsvp?.attendees ?? [])?.map((attendee) => ({
    userId: attendee.user_id,
    userName: attendee.user_name,
    userEmail: attendee.user_email,
    rsvpAt: attendee.rsvp_at,
    rewardRedeemedAt: attendee.reward_redeemed_at ?? null,
    rewardPointsAwarded:
      typeof attendee.reward_points_awarded === 'number' ? attendee.reward_points_awarded : null,
  }));
  const links: EventLinkRecord[] = (api.links ?? [])
    .map((link) => ({
      label: (link?.label ?? '').trim(),
      url: (link?.url ?? '').trim(),
    }))
    .filter((link) => link.label && link.url);
  return {
    id: api.id,
    title: api.title,
    subHeader: api.sub_header ?? '',
    body: api.body,
    url: api.url ?? null,
    createdAt: api.created_at,
    updatedAt: api.updated_at ?? null,
    hasRsvp: Boolean(api.rsvp?.enabled),
    rsvpKey: api.rsvp?.key ?? null,
    rsvpQrCodeUrl:
      typeof api.rsvp?.qr_code_url === 'string' && api.rsvp.qr_code_url.trim()
        ? api.rsvp.qr_code_url.trim()
        : null,
    rsvpRewardPoints: api.rsvp?.reward_points ?? 0,
    rsvpAttendees: attendees,
    links,
    tags: Array.isArray(api.tags)
      ? api.tags
          .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
          .filter((tag) => Boolean(tag))
      : [],
  };
}

function mapFeedback(api: FeedbackApi): FeedbackRecord {
  return {
    id: api.id,
    userId: api.userId,
    userName: api.userName,
    userEmail: api.userEmail,
    category: api.category ?? null,
    message: api.message,
    status: api.status,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
  };
}

function getFeedbackStatusColor(
  status: string,
): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' {
  const normalized = status.toLowerCase();
  if (normalized.includes('resolved')) {
    return 'success';
  }
  if (normalized.includes('progress')) {
    return 'warning';
  }
  if (normalized.includes('closed')) {
    return 'default';
  }
  return 'info';
}

function mapItem(api: ItemApi): ItemRecord {
  return {
    id: api.id,
    name: api.name,
    description: api.description,
    availabilityCount: api.availabilityCount,
    price: api.price,
    url: api.url ?? null,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
  };
}

function mapReward(api: RewardApi): RewardRecord {
  return {
    id: api.id,
    name: api.name,
    description: api.description,
    pointsCost: api.pointsCost,
    stock: api.stock,
    imageUrl: api.imageUrl ?? null,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
  };
}

function mapPoll(api: PollApi): PollRecord {
  return {
    id: api.id,
    question: api.question,
    options: api.options,
    imageUrl: api.imageUrl ?? null,
    isFinalized: api.isFinalized,
    rewardPoints: api.rewardPoints,
    rewardPointsAwarded: api.rewardPointsAwarded,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    finalizedAt: api.finalized_at ?? null,
    results: api.results ?? null,
    totalVotes: api.totalVotes,
  };
}

function mapCompetition(api: CompetitionApi): CompetitionRecord {
  return {
    id: api.id,
    title: api.title,
    summary: api.summary,
    details: api.details,
    imageUrl: api.imageUrl ?? null,
    isActive: api.isActive,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    submissionCount: api.submissionCount,
    userSubmission: api.userSubmission ?? null,
  };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  return date.toLocaleString();
}

type TabKey =
  | 'events'
  | 'attendance'
  | 'items'
  | 'rewards'
  | 'polls'
  | 'competitions'
  | 'notifications'
  | 'users'
  | 'posts'
  | 'feedback'
  | 'postModeration';

function TabPanel({ value, current, children }: { value: TabKey; current: TabKey; children: ReactNode }) {
  if (value !== current) {
    return null;
  }
  return <Box sx={{ pt: 4 }}>{children}</Box>;
}

// Administrative interface for managing events, rewards, polls and QR passes.
function AdminDashboardPage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === 'admin';
  const ADMIN_PAGE_SIZE = 6;
  const [activeTab, setActiveTab] = useState<TabKey>('events');
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [moderationQueue, setModerationQueue] = useState<ModerationRecord[]>([]);
  const [rewards, setRewards] = useState<RewardRecord[]>([]);
  const [polls, setPolls] = useState<PollRecord[]>([]);
  const [competitions, setCompetitions] = useState<CompetitionRecord[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRecord[]>([]);
  const [feedbackStatuses, setFeedbackStatuses] = useState<string[]>([]);
  const [feedbackUpdatingId, setFeedbackUpdatingId] = useState<string | null>(null);
  const [feedbackDeletingId, setFeedbackDeletingId] = useState<string | null>(null);
  const [adminNotificationTitle, setAdminNotificationTitle] = useState('');
  const [adminNotificationBody, setAdminNotificationBody] = useState('');
  const [adminNotificationStatus, setAdminNotificationStatus] = useState<
    { type: 'success' | 'error'; message: string } | null
  >(null);
  const [adminNotificationSubmitting, setAdminNotificationSubmitting] = useState(false);
  const [expandedAttendanceEventId, setExpandedAttendanceEventId] = useState<string | null>(null);
  const [attendancePage, setAttendancePage] = useState<Record<string, number>>({});
  const [attendanceRowsPerPage, setAttendanceRowsPerPage] = useState<Record<string, number>>({});
  const [attendanceSortOrder, setAttendanceSortOrder] = useState<
    Record<string, 'none' | 'attended-first' | 'pending-first'>
  >({});
  const [eventsSearch, setEventsSearch] = useState('');
  const [eventsPage, setEventsPage] = useState(1);
  const [attendanceEventSearch, setAttendanceEventSearch] = useState('');
  const [attendanceEventsPage, setAttendanceEventsPage] = useState(1);
  const [attendanceAttendeeSearch, setAttendanceAttendeeSearch] = useState<Record<string, string>>({});
  const [itemsSearch, setItemsSearch] = useState('');
  const [itemsPage, setItemsPage] = useState(1);
  const [rewardsSearch, setRewardsSearch] = useState('');
  const [rewardsPage, setRewardsPage] = useState(1);
  const [pollsSearch, setPollsSearch] = useState('');
  const [pollsPage, setPollsPage] = useState(1);
  const [competitionsSearch, setCompetitionsSearch] = useState('');
  const [competitionsPage, setCompetitionsPage] = useState(1);
  const [feedbackSearch, setFeedbackSearch] = useState('');
  const [feedbackPage, setFeedbackPage] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersPage, setUsersPage] = useState(1);
  const [postsSearch, setPostsSearch] = useState('');
  const [postsPage, setPostsPage] = useState(1);
  const [moderationSearch, setModerationSearch] = useState('');
  const [moderationPage, setModerationPage] = useState(1);

  const [creatingEvent, setCreatingEvent] = useState(false);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: '',
    subHeader: '',
    body: '',
    url: '',
    hasRsvp: false,
    rsvpRewardPoints: 0,
    links: [createEmptyEventLink()],
    tags: [] as string[],
  });
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventDialogForm, setEventDialogForm] = useState<EventRecord | null>(null);
  const [eventImageUploading, setEventImageUploading] = useState(false);
  const [eventImageUploadProgress, setEventImageUploadProgress] = useState(0);
  const [eventImageError, setEventImageError] = useState<string | null>(null);
  const [eventDialogImageUploading, setEventDialogImageUploading] = useState(false);
  const [eventDialogImageProgress, setEventDialogImageProgress] = useState(0);
  const [eventDialogImageError, setEventDialogImageError] = useState<string | null>(null);

  const [creatingItem, setCreatingItem] = useState(false);
  const [createItemOpen, setCreateItemOpen] = useState(false);
  const [itemForm, setItemForm] = useState({ name: '', description: '', availabilityCount: 0, price: 0, url: '' });
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [itemDialogForm, setItemDialogForm] = useState<ItemRecord | null>(null);
  const [itemImageUploading, setItemImageUploading] = useState(false);
  const [itemImageUploadProgress, setItemImageUploadProgress] = useState(0);
  const [itemImageError, setItemImageError] = useState<string | null>(null);
  const [itemDialogImageUploading, setItemDialogImageUploading] = useState(false);
  const [itemDialogImageProgress, setItemDialogImageProgress] = useState(0);
  const [itemDialogImageError, setItemDialogImageError] = useState<string | null>(null);

  const [creatingReward, setCreatingReward] = useState(false);
  const [createRewardOpen, setCreateRewardOpen] = useState(false);
  const [rewardForm, setRewardForm] = useState({
    name: '',
    description: '',
    pointsCost: 0,
    stock: 0,
    imageUrl: '',
  });
  const [rewardDialogOpen, setRewardDialogOpen] = useState(false);
  const [rewardDialogForm, setRewardDialogForm] = useState<RewardRecord | null>(null);
  const [rewardImageUploading, setRewardImageUploading] = useState(false);
  const [rewardImageUploadProgress, setRewardImageUploadProgress] = useState(0);
  const [rewardImageError, setRewardImageError] = useState<string | null>(null);
  const [rewardDialogImageUploading, setRewardDialogImageUploading] = useState(false);
  const [rewardDialogImageProgress, setRewardDialogImageProgress] = useState(0);
  const [rewardDialogImageError, setRewardDialogImageError] = useState<string | null>(null);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [createPollOpen, setCreatePollOpen] = useState(false);
  const [pollForm, setPollForm] = useState({ question: '', options: ['', ''], imageUrl: '', rewardPoints: 0 });
  const [pollDialogOpen, setPollDialogOpen] = useState(false);
  const [pollDialogForm, setPollDialogForm] = useState<PollRecord | null>(null);
  const [pollDialogOptions, setPollDialogOptions] = useState<string[]>([]);
  const [pollImageUploading, setPollImageUploading] = useState(false);
  const [pollImageUploadProgress, setPollImageUploadProgress] = useState(0);
  const [pollImageError, setPollImageError] = useState<string | null>(null);
  const [pollDialogImageUploading, setPollDialogImageUploading] = useState(false);
  const [pollDialogImageProgress, setPollDialogImageProgress] = useState(0);
  const [pollDialogImageError, setPollDialogImageError] = useState<string | null>(null);

  const handleBroadcastNotification = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!authUser) {
        return;
      }
      const title = adminNotificationTitle.trim();
      const body = adminNotificationBody.trim();
      if (!title || !body) {
        setAdminNotificationStatus({ type: 'error', message: 'Both a title and message are required.' });
        return;
      }
      setAdminNotificationSubmitting(true);
      setAdminNotificationStatus(null);
      try {
        await axios.post(`${API}/api/admin/notifications/broadcast`, {
          adminId: authUser.id,
          title,
          body,
        });
        setAdminNotificationStatus({ type: 'success', message: 'Notification sent to all users.' });
        setAdminNotificationTitle('');
        setAdminNotificationBody('');
      } catch (error) {
        console.error('Failed to send admin broadcast', error);
        setAdminNotificationStatus({
          type: 'error',
          message: 'Unable to send the notification right now. Please try again later.',
        });
      } finally {
        setAdminNotificationSubmitting(false);
      }
    },
    [adminNotificationBody, adminNotificationTitle, authUser],
  );

  const [creatingCompetition, setCreatingCompetition] = useState(false);
  const [createCompetitionOpen, setCreateCompetitionOpen] = useState(false);
  const [competitionForm, setCompetitionForm] = useState({
    title: '',
    summary: '',
    details: '',
    imageUrl: '',
    isActive: true,
  });
  const [competitionDialogOpen, setCompetitionDialogOpen] = useState(false);
  const [competitionDialogForm, setCompetitionDialogForm] = useState<CompetitionRecord | null>(null);
  const [competitionImageUploading, setCompetitionImageUploading] = useState(false);
  const [competitionImageUploadProgress, setCompetitionImageUploadProgress] = useState(0);
  const [competitionImageError, setCompetitionImageError] = useState<string | null>(null);
  const [competitionDialogImageUploading, setCompetitionDialogImageUploading] = useState(false);
  const [competitionDialogImageProgress, setCompetitionDialogImageProgress] = useState(0);
  const [competitionDialogImageError, setCompetitionDialogImageError] = useState<string | null>(null);
  const [submissionDialogOpen, setSubmissionDialogOpen] = useState(false);
  const [submissionDialogRecords, setSubmissionDialogRecords] = useState<CompetitionSubmissionRecord[]>([]);
  const [submissionDialogLoading, setSubmissionDialogLoading] = useState(false);
  const [submissionDialogCompetition, setSubmissionDialogCompetition] = useState<CompetitionRecord | null>(null);

  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'student' as 'student' | 'admin' });
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [userDialogForm, setUserDialogForm] = useState<UserRecord | null>(null);

  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [postDialogForm, setPostDialogForm] = useState<PostRecord | null>(null);
  const [moderationActionId, setModerationActionId] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    const { data } = await axios.get<EventApi[]>(`${API}/api/events`);
    setEvents(data.map(mapEvent));
  }, []);

  const fetchItems = useCallback(async () => {
    const { data } = await axios.get<ItemApi[]>(`${API}/api/items`);
    setItems(data.map(mapItem));
  }, []);

  const fetchRewards = useCallback(async () => {
    const { data } = await axios.get<RewardApi[]>(`${API}/api/rewards`);
    setRewards(data.map(mapReward));
  }, []);

  const fetchPolls = useCallback(async () => {
    const { data } = await axios.get<PollApi[]>(`${API}/api/polls`);
    setPolls(data.map(mapPoll));
  }, []);

  const fetchCompetitions = useCallback(async () => {
    const { data } = await axios.get<CompetitionApi[]>(`${API}/api/competitions`);
    setCompetitions(data.map(mapCompetition));
  }, []);

  const fetchUsers = useCallback(async () => {
    const { data } = await axios.get<UserRecord[]>(`${API}/api/users/`);
    setUsers(data);
  }, []);

  const fetchPosts = useCallback(async () => {
    const { data } = await axios.get<PostRecord[]>(`${API}/api/posts`);
    setPosts(data);
  }, []);

  const fetchModerationQueue = useCallback(async () => {
    const { data } = await axios.get<ModerationRecord[]>(
      `${API}/api/moderation/community-posts/rejected`,
    );
    setModerationQueue(data);
  }, []);

  const fetchFeedback = useCallback(async () => {
    const { data } = await axios.get<FeedbackApi[]>(`${API}/api/feedback`);
    setFeedback(data.map(mapFeedback));
  }, []);

  const fetchFeedbackStatuses = useCallback(async () => {
    const { data } = await axios.get<string[]>(`${API}/api/feedback/statuses`);
    setFeedbackStatuses(data);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([
          fetchEvents(),
          fetchItems(),
          fetchRewards(),
          fetchPolls(),
          fetchCompetitions(),
          fetchUsers(),
          fetchPosts(),
          fetchModerationQueue(),
          fetchFeedback(),
          fetchFeedbackStatuses(),
        ]);
      } catch (error) {
        console.error('Failed to load admin data', error);
      }
    })();
  }, [
    fetchEvents,
    fetchItems,
    fetchRewards,
    fetchPolls,
    fetchCompetitions,
    fetchUsers,
    fetchPosts,
    fetchModerationQueue,
    fetchFeedback,
    fetchFeedbackStatuses,
  ]);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [events],
  );
  const eventsWithRsvp = useMemo(
    () => sortedEvents.filter((eventRecord) => eventRecord.hasRsvp),
    [sortedEvents],
  );
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [items],
  );
  const sortedPosts = useMemo(
    () => [...posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [posts],
  );
  const sortedModerationQueue = useMemo(
    () =>
      [...moderationQueue].sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      ),
    [moderationQueue],
  );
  const sortedRewards = useMemo(
    () => [...rewards].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [rewards],
  );
  const sortedPolls = useMemo(
    () => [...polls].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [polls],
  );
  const sortedCompetitions = useMemo(
    () => [...competitions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [competitions],
  );
  const sortedFeedback = useMemo(
    () => [...feedback].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [feedback],
  );

  const filteredEvents = useMemo(() => {
    const query = eventsSearch.trim().toLowerCase();
    if (!query) {
      return sortedEvents;
    }
    return sortedEvents.filter((eventRecord) => eventRecord.title.toLowerCase().includes(query));
  }, [sortedEvents, eventsSearch]);
  const eventsPageCount = Math.max(1, Math.ceil(filteredEvents.length / ADMIN_PAGE_SIZE));
  const paginatedEvents = useMemo(
    () =>
      filteredEvents.slice(
        (eventsPage - 1) * ADMIN_PAGE_SIZE,
        (eventsPage - 1) * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE,
      ),
    [filteredEvents, eventsPage],
  );

  const filteredAttendanceEvents = useMemo(() => {
    const query = attendanceEventSearch.trim().toLowerCase();
    if (!query) {
      return eventsWithRsvp;
    }
    return eventsWithRsvp.filter((eventRecord) => eventRecord.title.toLowerCase().includes(query));
  }, [eventsWithRsvp, attendanceEventSearch]);
  const attendanceEventsPageCount = Math.max(
    1,
    Math.ceil(filteredAttendanceEvents.length / ADMIN_PAGE_SIZE),
  );
  const paginatedAttendanceEvents = useMemo(
    () =>
      filteredAttendanceEvents.slice(
        (attendanceEventsPage - 1) * ADMIN_PAGE_SIZE,
        (attendanceEventsPage - 1) * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE,
      ),
    [filteredAttendanceEvents, attendanceEventsPage],
  );

  const filteredItems = useMemo(() => {
    const query = itemsSearch.trim().toLowerCase();
    if (!query) {
      return sortedItems;
    }
    return sortedItems.filter((item) => item.name.toLowerCase().includes(query));
  }, [sortedItems, itemsSearch]);
  const itemsPageCount = Math.max(1, Math.ceil(filteredItems.length / ADMIN_PAGE_SIZE));
  const paginatedItems = useMemo(
    () =>
      filteredItems.slice(
        (itemsPage - 1) * ADMIN_PAGE_SIZE,
        (itemsPage - 1) * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE,
      ),
    [filteredItems, itemsPage],
  );

  const filteredRewards = useMemo(() => {
    const query = rewardsSearch.trim().toLowerCase();
    if (!query) {
      return sortedRewards;
    }
    return sortedRewards.filter((reward) => reward.name.toLowerCase().includes(query));
  }, [sortedRewards, rewardsSearch]);
  const rewardsPageCount = Math.max(1, Math.ceil(filteredRewards.length / ADMIN_PAGE_SIZE));
  const paginatedRewards = useMemo(
    () =>
      filteredRewards.slice(
        (rewardsPage - 1) * ADMIN_PAGE_SIZE,
        (rewardsPage - 1) * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE,
      ),
    [filteredRewards, rewardsPage],
  );

  const filteredPolls = useMemo(() => {
    const query = pollsSearch.trim().toLowerCase();
    if (!query) {
      return sortedPolls;
    }
    return sortedPolls.filter((poll) => poll.question.toLowerCase().includes(query));
  }, [sortedPolls, pollsSearch]);
  const pollsPageCount = Math.max(1, Math.ceil(filteredPolls.length / ADMIN_PAGE_SIZE));
  const paginatedPolls = useMemo(
    () =>
      filteredPolls.slice(
        (pollsPage - 1) * ADMIN_PAGE_SIZE,
        (pollsPage - 1) * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE,
      ),
    [filteredPolls, pollsPage],
  );

  const filteredCompetitions = useMemo(() => {
    const query = competitionsSearch.trim().toLowerCase();
    if (!query) {
      return sortedCompetitions;
    }
    return sortedCompetitions.filter((competition) =>
      competition.title.toLowerCase().includes(query),
    );
  }, [sortedCompetitions, competitionsSearch]);
  const competitionsPageCount = Math.max(1, Math.ceil(filteredCompetitions.length / ADMIN_PAGE_SIZE));
  const paginatedCompetitions = useMemo(
    () =>
      filteredCompetitions.slice(
        (competitionsPage - 1) * ADMIN_PAGE_SIZE,
        (competitionsPage - 1) * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE,
      ),
    [filteredCompetitions, competitionsPage],
  );

  const filteredFeedback = useMemo(() => {
    const query = feedbackSearch.trim().toLowerCase();
    if (!query) {
      return sortedFeedback;
    }
    return sortedFeedback.filter((record) =>
      `${record.userName ?? ''} ${record.userEmail} ${record.message}`.toLowerCase().includes(query),
    );
  }, [sortedFeedback, feedbackSearch]);
  const feedbackPageCount = Math.max(1, Math.ceil(filteredFeedback.length / ADMIN_PAGE_SIZE));
  const paginatedFeedback = useMemo(
    () =>
      filteredFeedback.slice(
        (feedbackPage - 1) * ADMIN_PAGE_SIZE,
        (feedbackPage - 1) * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE,
      ),
    [filteredFeedback, feedbackPage],
  );

  const filteredUsers = useMemo(() => {
    const query = usersSearch.trim().toLowerCase();
    if (!query) {
      return users;
    }
    return users.filter((userRecord) => (userRecord.name ?? '').toLowerCase().includes(query));
  }, [users, usersSearch]);
  const usersPageCount = Math.max(1, Math.ceil(filteredUsers.length / ADMIN_PAGE_SIZE));
  const paginatedUsers = useMemo(
    () =>
      filteredUsers.slice(
        (usersPage - 1) * ADMIN_PAGE_SIZE,
        (usersPage - 1) * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE,
      ),
    [filteredUsers, usersPage],
  );

  const filteredPosts = useMemo(() => {
    const query = postsSearch.trim().toLowerCase();
    if (!query) {
      return sortedPosts;
    }
    return sortedPosts.filter((post) => post.title.toLowerCase().includes(query));
  }, [sortedPosts, postsSearch]);
  const postsPageCount = Math.max(1, Math.ceil(filteredPosts.length / ADMIN_PAGE_SIZE));
  const paginatedPosts = useMemo(
    () =>
      filteredPosts.slice(
        (postsPage - 1) * ADMIN_PAGE_SIZE,
        (postsPage - 1) * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE,
      ),
    [filteredPosts, postsPage],
  );

  const filteredModeration = useMemo(() => {
    const query = moderationSearch.trim().toLowerCase();
    if (!query) {
      return sortedModerationQueue;
    }
    return sortedModerationQueue.filter((record) =>
      (record.title ?? '').toLowerCase().includes(query),
    );
  }, [sortedModerationQueue, moderationSearch]);
  const moderationPageCount = Math.max(1, Math.ceil(filteredModeration.length / ADMIN_PAGE_SIZE));
  const paginatedModeration = useMemo(
    () =>
      filteredModeration.slice(
        (moderationPage - 1) * ADMIN_PAGE_SIZE,
        (moderationPage - 1) * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE,
      ),
    [filteredModeration, moderationPage],
  );

  useEffect(() => {
    setEventsPage(1);
  }, [eventsSearch, sortedEvents]);
  useEffect(() => {
    setEventsPage((prev) => Math.min(prev, eventsPageCount));
  }, [eventsPageCount]);

  useEffect(() => {
    setAttendanceEventsPage(1);
  }, [attendanceEventSearch, eventsWithRsvp]);
  useEffect(() => {
    setAttendanceEventsPage((prev) => Math.min(prev, attendanceEventsPageCount));
  }, [attendanceEventsPageCount]);

  useEffect(() => {
    setItemsPage(1);
  }, [itemsSearch, sortedItems]);
  useEffect(() => {
    setItemsPage((prev) => Math.min(prev, itemsPageCount));
  }, [itemsPageCount]);

  useEffect(() => {
    setRewardsPage(1);
  }, [rewardsSearch, sortedRewards]);
  useEffect(() => {
    setRewardsPage((prev) => Math.min(prev, rewardsPageCount));
  }, [rewardsPageCount]);

  useEffect(() => {
    setPollsPage(1);
  }, [pollsSearch, sortedPolls]);
  useEffect(() => {
    setPollsPage((prev) => Math.min(prev, pollsPageCount));
  }, [pollsPageCount]);

  useEffect(() => {
    setCompetitionsPage(1);
  }, [competitionsSearch, sortedCompetitions]);
  useEffect(() => {
    setCompetitionsPage((prev) => Math.min(prev, competitionsPageCount));
  }, [competitionsPageCount]);

  useEffect(() => {
    setFeedbackPage(1);
  }, [feedbackSearch, sortedFeedback]);
  useEffect(() => {
    setFeedbackPage((prev) => Math.min(prev, feedbackPageCount));
  }, [feedbackPageCount]);

  useEffect(() => {
    setUsersPage(1);
  }, [usersSearch, users]);
  useEffect(() => {
    setUsersPage((prev) => Math.min(prev, usersPageCount));
  }, [usersPageCount]);

  useEffect(() => {
    setPostsPage(1);
  }, [postsSearch, sortedPosts]);
  useEffect(() => {
    setPostsPage((prev) => Math.min(prev, postsPageCount));
  }, [postsPageCount]);

  useEffect(() => {
    setModerationPage(1);
  }, [moderationSearch, sortedModerationQueue]);
  useEffect(() => {
    setModerationPage((prev) => Math.min(prev, moderationPageCount));
  }, [moderationPageCount]);

  const handleToggleAttendance = useCallback((eventId: string) => {
    setExpandedAttendanceEventId((prev) => {
      const next = prev === eventId ? null : eventId;
      if (next === eventId) {
        setAttendancePage((pageState) => ({ ...pageState, [eventId]: 0 }));
      }
      return next;
    });
  }, []);

  const handleAttendancePageChange = useCallback((eventId: string, newPage: number) => {
    setAttendancePage((prev) => ({ ...prev, [eventId]: newPage }));
  }, []);

  const handleAttendanceRowsPerPageChange = useCallback((eventId: string, newRowsPerPage: number) => {
    setAttendanceRowsPerPage((prev) => ({ ...prev, [eventId]: newRowsPerPage }));
    setAttendancePage((prev) => ({ ...prev, [eventId]: 0 }));
  }, []);

  const handleAttendanceStatusSortToggle = useCallback((eventId: string) => {
    setAttendanceSortOrder((prev) => {
      const current = prev[eventId] ?? 'none';
      const next =
        current === 'none'
          ? 'attended-first'
          : current === 'attended-first'
          ? 'pending-first'
          : 'none';
      return { ...prev, [eventId]: next };
    });
    setAttendancePage((prev) => ({ ...prev, [eventId]: 0 }));
  }, []);

  function validateImageFile(file: File) {
    if (!file.type.startsWith('image/')) {
      return 'Please select an image file (PNG, JPG, GIF, WebP, etc.).';
    }
    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      return 'Images must be 10MB or smaller.';
    }
    return null;
  }

  async function uploadImageFile(
    file: File,
    setUploading: (value: boolean) => void,
    setProgress: (value: number) => void,
    setError: (value: string | null) => void,
  ): Promise<string | null> {
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return null;
    }

    const form = new FormData();
    form.append('file', file, file.name);
    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      const { data } = await axios.post<UploadResponse>(`${API}/api/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (!event.total) {
            return;
          }
          const percent = Math.round((event.loaded / event.total) * 100);
          setProgress(percent);
        },
      });
      const uploadedUrl = data.url ?? data.blobUrl ?? null;
      if (!uploadedUrl) {
        throw new Error('Upload did not return a URL.');
      }
      setProgress(100);
      return uploadedUrl;
    } catch (error) {
      console.error('Image upload failed', error);
      setError('Image upload failed. Please try again.');
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleEventImageSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const uploadedUrl = await uploadImageFile(
      file,
      setEventImageUploading,
      setEventImageUploadProgress,
      setEventImageError,
    );
    if (uploadedUrl) {
      setEventForm((prev) => ({ ...prev, url: uploadedUrl }));
    }
  }

  async function handleEventDialogImageSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const uploadedUrl = await uploadImageFile(
      file,
      setEventDialogImageUploading,
      setEventDialogImageProgress,
      setEventDialogImageError,
    );
    if (uploadedUrl) {
      setEventDialogForm((prev) => (prev ? { ...prev, url: uploadedUrl } : prev));
    }
  }

  async function handleItemImageSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const uploadedUrl = await uploadImageFile(
      file,
      setItemImageUploading,
      setItemImageUploadProgress,
      setItemImageError,
    );
    if (uploadedUrl) {
      setItemForm((prev) => ({ ...prev, url: uploadedUrl }));
    }
  }

  async function handleItemDialogImageSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const uploadedUrl = await uploadImageFile(
      file,
      setItemDialogImageUploading,
      setItemDialogImageProgress,
      setItemDialogImageError,
    );
    if (uploadedUrl) {
      setItemDialogForm((prev) => (prev ? { ...prev, url: uploadedUrl } : prev));
    }
  }

  async function handleRewardImageSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const uploadedUrl = await uploadImageFile(
      file,
      setRewardImageUploading,
      setRewardImageUploadProgress,
      setRewardImageError,
    );
    if (uploadedUrl) {
      setRewardForm((prev) => ({ ...prev, imageUrl: uploadedUrl }));
    }
  }

  async function handleRewardDialogImageSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const uploadedUrl = await uploadImageFile(
      file,
      setRewardDialogImageUploading,
      setRewardDialogImageProgress,
      setRewardDialogImageError,
    );
    if (uploadedUrl) {
      setRewardDialogForm((prev) => (prev ? { ...prev, imageUrl: uploadedUrl } : prev));
    }
  }

  async function handlePollImageSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const uploadedUrl = await uploadImageFile(
      file,
      setPollImageUploading,
      setPollImageUploadProgress,
      setPollImageError,
    );
    if (uploadedUrl) {
      setPollForm((prev) => ({ ...prev, imageUrl: uploadedUrl }));
    }
  }

  async function handlePollDialogImageSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const uploadedUrl = await uploadImageFile(
      file,
      setPollDialogImageUploading,
      setPollDialogImageProgress,
      setPollDialogImageError,
    );
    if (uploadedUrl) {
      setPollDialogForm((prev) => (prev ? { ...prev, imageUrl: uploadedUrl } : prev));
    }
  }

  function handleAddPollOption() {
    setPollForm((prev) => ({ ...prev, options: [...prev.options, ''] }));
  }

  function handleUpdatePollOption(index: number, value: string) {
    setPollForm((prev) => {
      const options = [...prev.options];
      options[index] = value;
      return { ...prev, options };
    });
  }

  function handleRemovePollOption(index: number) {
    setPollForm((prev) => {
      if (prev.options.length <= 2) {
        return prev;
      }
      const options = prev.options.filter((_, optionIndex) => optionIndex !== index);
      return { ...prev, options };
    });
  }

  function handleDialogPollOptionChange(index: number, value: string) {
    setPollDialogOptions((prev) => {
      const options = [...prev];
      options[index] = value;
      return options;
    });
  }

  function handleAddDialogPollOption() {
    setPollDialogOptions((prev) => [...prev, '']);
  }

  function handleRemoveDialogPollOption(index: number) {
    setPollDialogOptions((prev) => {
      if (prev.length <= 2) {
        return prev;
      }
      return prev.filter((_, optionIndex) => optionIndex !== index);
    });
  }

  async function handleCompetitionImageSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const uploadedUrl = await uploadImageFile(
      file,
      setCompetitionImageUploading,
      setCompetitionImageUploadProgress,
      setCompetitionImageError,
    );
    if (uploadedUrl) {
      setCompetitionForm((prev) => ({ ...prev, imageUrl: uploadedUrl }));
    }
  }

  async function handleCompetitionDialogImageSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const uploadedUrl = await uploadImageFile(
      file,
      setCompetitionDialogImageUploading,
      setCompetitionDialogImageProgress,
      setCompetitionDialogImageError,
    );
    if (uploadedUrl) {
      setCompetitionDialogForm((prev) => (prev ? { ...prev, imageUrl: uploadedUrl } : prev));
    }
  }

  function handleEventLinkChange(index: number, field: 'label' | 'url', value: string) {
    setEventForm((prev) => {
      const nextLinks = prev.links.map((link, linkIndex) =>
        linkIndex === index ? { ...link, [field]: value } : link,
      );
      return { ...prev, links: nextLinks };
    });
  }

  function handleAddEventLink() {
    setEventForm((prev) => ({ ...prev, links: [...prev.links, createEmptyEventLink()] }));
  }

  function handleRemoveEventLink(index: number) {
    setEventForm((prev) => {
      const nextLinks = prev.links.filter((_, linkIndex) => linkIndex !== index);
      return { ...prev, links: nextLinks.length > 0 ? nextLinks : [createEmptyEventLink()] };
    });
  }

  function resetEventForm() {
    setEventForm({
      title: '',
      subHeader: '',
      body: '',
      url: '',
      hasRsvp: false,
      rsvpRewardPoints: 0,
      links: [createEmptyEventLink()],
      tags: [],
    });
    setEventImageUploadProgress(0);
    setEventImageError(null);
    setEventImageUploading(false);
  }

  const handleOpenCreateEvent = () => {
    setCreateEventOpen(true);
  };

  const handleCloseCreateEvent = () => {
    if (creatingEvent || eventImageUploading) {
      return;
    }
    setCreateEventOpen(false);
    resetEventForm();
  };

  function handleEventDialogLinkChange(index: number, field: 'label' | 'url', value: string) {
    setEventDialogForm((prev) => {
      if (!prev) {
        return prev;
      }
      const nextLinks = prev.links.map((link, linkIndex) =>
        linkIndex === index ? { ...link, [field]: value } : link,
      );
      return { ...prev, links: nextLinks };
    });
  }

  function handleAddEventDialogLink() {
    setEventDialogForm((prev) => (prev ? { ...prev, links: [...prev.links, createEmptyEventLink()] } : prev));
  }

  function handleRemoveEventDialogLink(index: number) {
    setEventDialogForm((prev) => {
      if (!prev) {
        return prev;
      }
      const nextLinks = prev.links.filter((_, linkIndex) => linkIndex !== index);
      return { ...prev, links: nextLinks.length > 0 ? nextLinks : [createEmptyEventLink()] };
    });
  }

  async function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = eventForm.title.trim();
    const body = eventForm.body.trim();
    if (!title || !body) {
      alert('Title and body are required for events.');
      return;
    }
    if (eventImageUploading) {
      alert('Please wait for the image upload to finish.');
      return;
    }
    try {
      setCreatingEvent(true);
      const links = eventForm.links
        .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
        .filter((link) => link.label && link.url);
      const payload = {
        title,
        body,
        subHeader: eventForm.subHeader.trim() ? eventForm.subHeader.trim() : null,
        url: eventForm.url.trim() ? eventForm.url.trim() : null,
        hasRsvp: eventForm.hasRsvp,
        rsvpRewardPoints: eventForm.hasRsvp ? Math.max(0, Number(eventForm.rsvpRewardPoints)) : null,
        links,
        tags: eventForm.tags,
      };
      const { data } = await axios.post<EventApi>(`${API}/api/post/events`, payload);
      setEvents((prev) => [mapEvent(data), ...prev]);
      resetEventForm();
      setCreateEventOpen(false);
    } catch (error) {
      console.error('Failed to create event', error);
      showAdminRequestError(error, 'Unable to create event. Please try again.', {
        forbiddenMessage: 'Admin access required to create events.',
        unauthorizedMessage: 'Session expired. Please log in again.',
      });
    } finally {
      setCreatingEvent(false);
    }
  }

  async function handleUpdateEvent() {
    if (!eventDialogForm) {
      return;
    }
    const links = eventDialogForm.links
      .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
      .filter((link) => link.label && link.url);
    const payload = {
      title: eventDialogForm.title.trim(),
      subHeader: eventDialogForm.subHeader.trim() ? eventDialogForm.subHeader.trim() : null,
      body: eventDialogForm.body.trim(),
      url: eventDialogForm.url ? eventDialogForm.url.trim() : null,
      hasRsvp: eventDialogForm.hasRsvp,
      rsvpRewardPoints: eventDialogForm.hasRsvp
        ? Math.max(0, Number(eventDialogForm.rsvpRewardPoints))
        : null,
      links,
      tags: eventDialogForm.tags,
    };
    if (!payload.title || !payload.body) {
      alert('Title and body cannot be empty.');
      return;
    }
    if (eventDialogImageUploading) {
      alert('Please wait for the image upload to finish.');
      return;
    }
    try {
      const { data } = await axios.patch<EventApi>(`${API}/api/events/${eventDialogForm.id}`, payload);
      const updated = mapEvent(data);
      setEvents((prev) => prev.map((eventRecord) => (eventRecord.id === updated.id ? updated : eventRecord)));
      setEventDialogOpen(false);
      setEventDialogForm(null);
      setEventDialogImageProgress(0);
      setEventDialogImageError(null);
      setEventDialogImageUploading(false);
    } catch (error) {
      console.error('Failed to update event', error);
      showAdminRequestError(error, 'Unable to update event. Please try again.', {
        forbiddenMessage: 'Admin access required to update events.',
        unauthorizedMessage: 'Session expired. Please log in again.',
      });
    }
  }

  async function handleDeleteEvent(eventId: string) {
    if (!window.confirm('Delete this event? This action cannot be undone.')) {
      return;
    }
    try {
      await axios.delete(`${API}/api/events/${eventId}`);
      setEvents((prev) => prev.filter((event) => event.id !== eventId));
    } catch (error) {
      console.error('Failed to delete event', error);
      showAdminRequestError(error, 'Unable to delete event. Please try again.', {
        forbiddenMessage: 'Admin access required to delete events.',
        unauthorizedMessage: 'Session expired. Please log in again.',
      });
    }
  }

  async function handleUpdateFeedbackStatus(feedbackId: string, statusValue: string) {
    try {
      setFeedbackUpdatingId(feedbackId);
      const { data } = await axios.patch<FeedbackApi>(`${API}/api/feedback/${feedbackId}`, {
        status: statusValue,
      });
      const updated = mapFeedback(data);
      setFeedback((prev) => prev.map((record) => (record.id === feedbackId ? updated : record)));
    } catch (error) {
      console.error('Failed to update feedback status', error);
      alert('Unable to update feedback status. Please try again.');
    } finally {
      setFeedbackUpdatingId(null);
    }
  }

  async function handleDeleteFeedback(feedbackId: string) {
    if (!window.confirm('Delete this feedback entry? This action cannot be undone.')) {
      return;
    }
    try {
      setFeedbackDeletingId(feedbackId);
      await axios.delete(`${API}/api/feedback/${feedbackId}`);
      setFeedback((prev) => prev.filter((record) => record.id !== feedbackId));
    } catch (error) {
      console.error('Failed to delete feedback', error);
      alert('Unable to delete feedback. Please try again.');
    } finally {
      setFeedbackDeletingId(null);
    }
  }

  function resetItemForm() {
    setItemForm({ name: '', description: '', availabilityCount: 0, price: 0, url: '' });
    setItemImageUploadProgress(0);
    setItemImageError(null);
    setItemImageUploading(false);
  }

  const handleOpenCreateItem = () => {
    setCreateItemOpen(true);
  };

  const handleCloseCreateItem = () => {
    if (creatingItem || itemImageUploading) {
      return;
    }
    setCreateItemOpen(false);
    resetItemForm();
  };

  async function handleCreateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = itemForm.name.trim();
    const description = itemForm.description.trim();
    if (!name) {
      alert('Item name is required.');
      return;
    }
    if (itemImageUploading) {
      alert('Please wait for the image upload to finish.');
      return;
    }
    try {
      setCreatingItem(true);
      const payload = {
        name,
        description,
        availabilityCount: Number(itemForm.availabilityCount),
        price: Number(itemForm.price),
        url: itemForm.url.trim() ? itemForm.url.trim() : null,
      };
      const { data } = await axios.post<ItemApi>(`${API}/api/items`, payload);
      setItems((prev) => [mapItem(data), ...prev]);
      resetItemForm();
      setCreateItemOpen(false);
    } catch (error) {
      console.error('Failed to create item', error);
      alert('Unable to create item. Please try again.');
    } finally {
      setCreatingItem(false);
    }
  }

  async function handleUpdateItem() {
    if (!itemDialogForm) {
      return;
    }
    if (itemDialogImageUploading) {
      alert('Please wait for the image upload to finish.');
      return;
    }
    try {
      const payload = {
        name: itemDialogForm.name.trim(),
        description: itemDialogForm.description.trim(),
        availabilityCount: itemDialogForm.availabilityCount,
        price: itemDialogForm.price,
        url: itemDialogForm.url ? itemDialogForm.url.trim() : null,
      };
      const { data } = await axios.patch<ItemApi>(`${API}/api/items/${itemDialogForm.id}`, payload);
      const updated = mapItem(data);
      setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setItemDialogImageProgress(0);
      setItemDialogImageError(null);
      setItemDialogImageUploading(false);
      setItemDialogOpen(false);
      setItemDialogForm(null);
    } catch (error) {
      console.error('Failed to update item', error);
      alert('Unable to update item. Please try again.');
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!window.confirm('Delete this product?')) {
      return;
    }
    try {
      await axios.delete(`${API}/api/items/${itemId}`);
      setItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (error) {
      console.error('Failed to delete item', error);
      showAdminRequestError(error, 'Unable to delete item. Please try again.', {
        forbiddenMessage: 'Admin access required to delete items.',
        unauthorizedMessage: 'Session expired. Please log in again.',
      });
    }
  }

  function resetRewardForm() {
    setRewardForm({ name: '', description: '', pointsCost: 0, stock: 0, imageUrl: '' });
    setRewardImageUploadProgress(0);
    setRewardImageError(null);
    setRewardImageUploading(false);
  }

  const handleOpenCreateReward = () => {
    setCreateRewardOpen(true);
  };

  const handleCloseCreateReward = () => {
    if (creatingReward || rewardImageUploading) {
      return;
    }
    setCreateRewardOpen(false);
    resetRewardForm();
  };

  async function handleCreateReward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = rewardForm.name.trim();
    if (!name) {
      alert('Reward name is required.');
      return;
    }
    if (rewardImageUploading) {
      alert('Please wait for the image upload to finish.');
      return;
    }
    try {
      setCreatingReward(true);
      const payload = {
        name,
        description: rewardForm.description.trim(),
        pointsCost: Number(rewardForm.pointsCost),
        stock: Number.isFinite(Number(rewardForm.stock))
          ? Math.max(0, Number(rewardForm.stock))
          : 0,
        imageUrl: rewardForm.imageUrl.trim() ? rewardForm.imageUrl.trim() : null,
      };
      const { data } = await axios.post<RewardApi>(`${API}/api/rewards`, payload);
      setRewards((prev) => [mapReward(data), ...prev]);
      resetRewardForm();
      setCreateRewardOpen(false);
    } catch (error) {
      console.error('Failed to create reward', error);
      alert('Unable to create reward. Please try again.');
    } finally {
      setCreatingReward(false);
    }
  }

  async function handleUpdateReward() {
    if (!rewardDialogForm) {
      return;
    }
    if (rewardDialogImageUploading) {
      alert('Please wait for the image upload to finish.');
      return;
    }
    try {
      const payload = {
        name: rewardDialogForm.name.trim(),
        description: rewardDialogForm.description.trim(),
        pointsCost: rewardDialogForm.pointsCost,
        stock: rewardDialogForm.stock,
        imageUrl: rewardDialogForm.imageUrl ? rewardDialogForm.imageUrl.trim() : null,
      };
      const { data } = await axios.patch<RewardApi>(`${API}/api/rewards/${rewardDialogForm.id}`, payload);
      const updated = mapReward(data);
      setRewards((prev) => prev.map((reward) => (reward.id === updated.id ? updated : reward)));
      setRewardDialogOpen(false);
      setRewardDialogForm(null);
      setRewardDialogImageProgress(0);
      setRewardDialogImageError(null);
      setRewardDialogImageUploading(false);
    } catch (error) {
      console.error('Failed to update reward', error);
      alert('Unable to update reward. Please try again.');
    }
  }

  async function handleDeleteReward(rewardId: string) {
    if (!window.confirm('Delete this reward?')) {
      return;
    }
    try {
      await axios.delete(`${API}/api/rewards/${rewardId}`);
      setRewards((prev) => prev.filter((reward) => reward.id !== rewardId));
    } catch (error) {
      console.error('Failed to delete reward', error);
      alert('Unable to delete reward. Please try again.');
    }
  }

  function resetPollForm() {
    setPollForm({ question: '', options: ['', ''], imageUrl: '', rewardPoints: 0 });
    setPollImageUploadProgress(0);
    setPollImageError(null);
    setPollImageUploading(false);
  }

  const handleOpenCreatePoll = () => {
    setCreatePollOpen(true);
  };

  const handleCloseCreatePoll = () => {
    if (creatingPoll || pollImageUploading) {
      return;
    }
    setCreatePollOpen(false);
    resetPollForm();
  };

  async function handleCreatePoll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = pollForm.question.trim();
    const options = pollForm.options.map((option) => option.trim()).filter(Boolean);
    if (!question) {
      alert('Poll question is required.');
      return;
    }
    if (options.length < 2) {
      alert('Please provide at least two poll options.');
      return;
    }
    if (pollImageUploading) {
      alert('Please wait for the image upload to finish.');
      return;
    }
    try {
      setCreatingPoll(true);
      const rewardPoints = Math.max(0, Number(pollForm.rewardPoints) || 0);
      const payload = {
        question,
        options,
        imageUrl: pollForm.imageUrl.trim() ? pollForm.imageUrl.trim() : null,
        rewardPoints,
      };
      const { data } = await axios.post<PollApi>(`${API}/api/polls`, payload);
      setPolls((prev) => [mapPoll(data), ...prev]);
      resetPollForm();
      setCreatePollOpen(false);
    } catch (error) {
      console.error('Failed to create poll', error);
      showAdminRequestError(error, 'Unable to create poll. Please try again.', {
        forbiddenMessage: 'Admin access required to create polls.',
        unauthorizedMessage: 'Session expired. Please log in again.',
      });
    } finally {
      setCreatingPoll(false);
    }
  }

  async function handleUpdatePoll() {
    if (!pollDialogForm) {
      return;
    }
    if (pollDialogForm.isFinalized) {
      alert('Finalised polls cannot be edited.');
      return;
    }
    if (pollDialogImageUploading) {
      alert('Please wait for the image upload to finish.');
      return;
    }
    const question = pollDialogForm.question.trim();
    const options = pollDialogOptions.map((option) => option.trim()).filter(Boolean);
    if (!question) {
      alert('Poll question is required.');
      return;
    }
    if (options.length < 2) {
      alert('Please provide at least two poll options.');
      return;
    }
    const rewardPoints = Math.max(0, Number(pollDialogForm.rewardPoints) || 0);
    try {
      const payload = {
        question,
        options,
        imageUrl: pollDialogForm.imageUrl ? pollDialogForm.imageUrl.trim() : null,
        rewardPoints,
      };
      const { data } = await axios.patch<PollApi>(`${API}/api/polls/${pollDialogForm.id}`, payload);
      const updated = mapPoll(data);
      setPolls((prev) => prev.map((poll) => (poll.id === updated.id ? updated : poll)));
      setPollDialogOpen(false);
      setPollDialogForm(null);
      setPollDialogOptions([]);
      setPollDialogImageProgress(0);
      setPollDialogImageError(null);
      setPollDialogImageUploading(false);
    } catch (error) {
      console.error('Failed to update poll', error);
      showAdminRequestError(error, 'Unable to update poll. Please try again.', {
        forbiddenMessage: 'Admin access required to update polls.',
        unauthorizedMessage: 'Session expired. Please log in again.',
      });
    }
  }

  async function handleFinalizePoll(pollId: string) {
    if (!window.confirm('Finalize this poll? Results will be visible to students.')) {
      return;
    }
    try {
      const { data } = await axios.post<PollApi>(`${API}/api/polls/${pollId}/finalize`);
      const updated = mapPoll(data);
      setPolls((prev) => prev.map((poll) => (poll.id === pollId ? updated : poll)));
    } catch (error) {
      console.error('Failed to finalize poll', error);
      alert('Unable to finalize poll. Please try again.');
    }
  }

  async function handleDeletePoll(pollId: string) {
    if (!window.confirm('Delete this poll?')) {
      return;
    }
    try {
      await axios.delete(`${API}/api/polls/${pollId}`);
      setPolls((prev) => prev.filter((poll) => poll.id !== pollId));
    } catch (error) {
      console.error('Failed to delete poll', error);
      showAdminRequestError(error, 'Unable to delete poll. Please try again.', {
        forbiddenMessage: 'Admin access required to delete polls.',
        unauthorizedMessage: 'Session expired. Please log in again.',
      });
    }
  }

  function resetCompetitionForm() {
    setCompetitionForm({ title: '', summary: '', details: '', imageUrl: '', isActive: true });
    setCompetitionImageUploadProgress(0);
    setCompetitionImageError(null);
    setCompetitionImageUploading(false);
  }

  const handleOpenCreateCompetition = () => {
    setCreateCompetitionOpen(true);
  };

  const handleCloseCreateCompetition = () => {
    if (creatingCompetition || competitionImageUploading) {
      return;
    }
    setCreateCompetitionOpen(false);
    resetCompetitionForm();
  };

  async function handleCreateCompetition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = competitionForm.title.trim();
    const summary = competitionForm.summary.trim();
    const details = competitionForm.details.trim();
    if (!title || !summary || !details) {
      alert('Title, summary and details are required.');
      return;
    }
    if (competitionImageUploading) {
      alert('Please wait for the image upload to finish.');
      return;
    }
    try {
      setCreatingCompetition(true);
      const payload = {
        title,
        summary,
        details,
        imageUrl: competitionForm.imageUrl.trim() ? competitionForm.imageUrl.trim() : null,
        isActive: competitionForm.isActive,
      };
      const { data } = await axios.post<CompetitionApi>(`${API}/api/competitions`, payload);
      setCompetitions((prev) => [mapCompetition(data), ...prev]);
      resetCompetitionForm();
      setCreateCompetitionOpen(false);
    } catch (error) {
      console.error('Failed to create competition', error);
      showAdminRequestError(error, 'Unable to create competition. Please try again.', {
        forbiddenMessage: 'Admin access required to create competitions.',
        unauthorizedMessage: 'Session expired. Please log in again.',
      });
    } finally {
      setCreatingCompetition(false);
    }
  }

  async function handleUpdateCompetition() {
    if (!competitionDialogForm) {
      return;
    }
    if (competitionDialogImageUploading) {
      alert('Please wait for the image upload to finish.');
      return;
    }
    const title = competitionDialogForm.title.trim();
    const summary = competitionDialogForm.summary.trim();
    const details = competitionDialogForm.details.trim();
    if (!title || !summary || !details) {
      alert('Title, summary and details cannot be empty.');
      return;
    }
    try {
      const payload = {
        title,
        summary,
        details,
        imageUrl: competitionDialogForm.imageUrl ? competitionDialogForm.imageUrl.trim() : null,
        isActive: competitionDialogForm.isActive,
      };
      const { data } = await axios.patch<CompetitionApi>(
        `${API}/api/competitions/${competitionDialogForm.id}`,
        payload,
      );
      const updated = mapCompetition(data);
      setCompetitions((prev) => prev.map((competition) => (competition.id === updated.id ? updated : competition)));
      setCompetitionDialogOpen(false);
      setCompetitionDialogForm(null);
      setCompetitionDialogImageProgress(0);
      setCompetitionDialogImageError(null);
      setCompetitionDialogImageUploading(false);
    } catch (error) {
      console.error('Failed to update competition', error);
      showAdminRequestError(error, 'Unable to update competition. Please try again.', {
        forbiddenMessage: 'Admin access required to update competitions.',
        unauthorizedMessage: 'Session expired. Please log in again.',
      });
    }
  }

  async function handleDeleteCompetition(competitionId: string) {
    if (!window.confirm('Delete this competition?')) {
      return;
    }
    try {
      await axios.delete(`${API}/api/competitions/${competitionId}`);
      setCompetitions((prev) => prev.filter((competition) => competition.id !== competitionId));
    } catch (error) {
      console.error('Failed to delete competition', error);
      showAdminRequestError(error, 'Unable to delete competition. Please try again.', {
        forbiddenMessage: 'Admin access required to delete competitions.',
        unauthorizedMessage: 'Session expired. Please log in again.',
      });
    }
  }

  async function handleToggleCompetitionActive(competition: CompetitionRecord, value: boolean) {
    try {
      const { data } = await axios.patch<CompetitionApi>(`${API}/api/competitions/${competition.id}`, {
        isActive: value,
      });
      const updated = mapCompetition(data);
      setCompetitions((prev) => prev.map((entry) => (entry.id === competition.id ? updated : entry)));
    } catch (error) {
      console.error('Failed to update competition status', error);
      alert('Unable to update competition status. Please try again.');
    }
  }

  async function handleViewSubmissions(competition: CompetitionRecord) {
    setSubmissionDialogCompetition(competition);
    setSubmissionDialogOpen(true);
    setSubmissionDialogLoading(true);
    try {
      const { data } = await axios.get<CompetitionSubmissionRecord[]>(
        `${API}/api/admin/competitions/${competition.id}/submissions`,
      );
      setSubmissionDialogRecords(data);
    } catch (error) {
      console.error('Failed to load submissions', error);
      alert('Unable to load competition submissions. Please try again.');
      setSubmissionDialogOpen(false);
    } finally {
      setSubmissionDialogLoading(false);
    }
  }

  function handleCloseSubmissionDialog() {
    setSubmissionDialogOpen(false);
    setSubmissionDialogCompetition(null);
    setSubmissionDialogRecords([]);
    setSubmissionDialogLoading(false);
  }

  function resetUserForm() {
    setUserForm({ name: '', email: '', password: '', role: 'student' });
  }

  const handleOpenCreateUser = () => {
    setCreateUserOpen(true);
  };

  const handleCloseCreateUser = () => {
    if (creatingUser) {
      return;
    }
    setCreateUserOpen(false);
    resetUserForm();
  };

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = userForm.name.trim();
    const email = userForm.email.trim();
    if (!name || !email || !userForm.password.trim()) {
      alert('Name, email and password are required.');
      return;
    }
    try {
      setCreatingUser(true);
      const payload = { name, email, password: userForm.password, role: userForm.role };
      await axios.post(`${API}/api/users/`, payload);
      await fetchUsers();
      resetUserForm();
      setCreateUserOpen(false);
    } catch (error) {
      console.error('Failed to create user', error);
      alert('Unable to create user. Please try again.');
    } finally {
      setCreatingUser(false);
    }
  }

  async function handleUpdateUser() {
    if (!userDialogForm) {
      return;
    }
    try {
      const payload = {
        name: userDialogForm.name,
        role: userDialogForm.role,
        rewardPoints: Math.max(0, Number(userDialogForm.rewardPoints)),
      };
      const { data } = await axios.patch<UserRecord>(`${API}/api/users/${userDialogForm.id}`, payload);
      setUsers((prev) => prev.map((userRecord) => (userRecord.id === data.id ? data : userRecord)));
      setUserDialogOpen(false);
      setUserDialogForm(null);
    } catch (error) {
      console.error('Failed to update user', error);
      alert('Unable to update user. Please try again.');
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!window.confirm('Delete this user?')) {
      return;
    }
    try {
      await axios.delete(`${API}/api/users/${userId}`);
      setUsers((prev) => prev.filter((userRecord) => userRecord.id !== userId));
    } catch (error) {
      console.error('Failed to delete user', error);
      alert('Unable to delete user. Please try again.');
    }
  }

  async function handleUpdatePost() {
    if (!postDialogForm) {
      return;
    }
    try {
      const payload = {
        title: postDialogForm.title.trim(),
        content: postDialogForm.content.trim(),
        flair: postDialogForm.flair?.trim() ? postDialogForm.flair.trim() : null,
        imageUrl: postDialogForm.imageUrl?.trim() ? postDialogForm.imageUrl.trim() : null,
      };
      if (!payload.title || !payload.content) {
        alert('Title and content cannot be empty.');
        return;
      }
      const { data } = await axios.patch<PostRecord>(`${API}/api/posts/${postDialogForm.id}`, payload);
      setPosts((prev) => prev.map((post) => (post.id === data.id ? data : post)));
      setPostDialogOpen(false);
      setPostDialogForm(null);
    } catch (error) {
      console.error('Failed to update post', error);
      alert('Unable to update post. Please try again.');
    }
  }

  async function handleDeletePost(postId: string) {
    if (!window.confirm('Delete this community post?')) {
      return;
    }
    try {
      await axios.delete(`${API}/api/posts/${postId}`);
      setPosts((prev) => prev.filter((post) => post.id !== postId));
    } catch (error) {
      console.error('Failed to delete post', error);
      showAdminRequestError(error, 'Unable to delete post. Please try again.', {
        forbiddenMessage: 'Admin access required to delete posts.',
        unauthorizedMessage: 'Session expired. Please log in again.',
      });
    }
  }

  async function handleDeleteComment(postId: string, commentId: string) {
    try {
      const { data } = await axios.delete<PostRecord>(`${API}/api/posts/${postId}/comments/${commentId}`);
      setPosts((prev) => prev.map((post) => (post.id === postId ? data : post)));
    } catch (error) {
      console.error('Failed to delete comment', error);
      alert('Unable to delete comment. Please try again.');
    }
  }

  async function handleApproveModeratedPost(record: ModerationRecord) {
    if (!isAdmin || !authUser) {
      alert('You must be logged in as an admin to approve posts.');
      return;
    }
    try {
      setModerationActionId(record.id);
      const payload = { adminId: authUser.id, note: null };
      const { data } = await axios.post<PostRecord>(
        `${API}/api/moderation/community-posts/${record.id}/approve`,
        payload,
      );
      setPosts((prev) => [data, ...prev]);
      setModerationQueue((prev) => prev.filter((item) => item.id !== record.id));
    } catch (error) {
      console.error('Failed to approve moderated post', error);
      alert('Unable to approve this post. Please try again.');
    } finally {
      setModerationActionId(null);
    }
  }

  async function handleRejectModeratedPost(record: ModerationRecord) {
    if (!isAdmin || !authUser) {
      alert('You must be logged in as an admin to reject posts.');
      return;
    }
    if (!window.confirm('Reject this post and keep it out of the community feed?')) {
      return;
    }
    try {
      setModerationActionId(record.id);
      const payload = { adminId: authUser.id, note: null };
      await axios.post<ModerationRecord>(
        `${API}/api/moderation/community-posts/${record.id}/reject`,
        payload,
      );
      setModerationQueue((prev) => prev.filter((item) => item.id !== record.id));
    } catch (error) {
      console.error('Failed to reject moderated post', error);
      alert('Unable to reject this post. Please try again.');
    } finally {
      setModerationActionId(null);
    }
  }

  const creationFabConfig = (() => {
    switch (activeTab) {
      case 'events':
        return { label: 'Create event', onClick: handleOpenCreateEvent };
      case 'items':
        return { label: 'Add product', onClick: handleOpenCreateItem };
      case 'rewards':
        return { label: 'Create reward', onClick: handleOpenCreateReward };
      case 'polls':
        return { label: 'Create poll', onClick: handleOpenCreatePoll };
      case 'competitions':
        return { label: 'Create competition', onClick: handleOpenCreateCompetition };
      case 'users':
        return { label: 'Invite user', onClick: handleOpenCreateUser };
      default:
        return null;
    }
  })();
  const fabHidden =
    createEventOpen ||
    createItemOpen ||
    createRewardOpen ||
    createPollOpen ||
    createCompetitionOpen ||
    createUserOpen;

  return (
    <>
      <Helmet>
        <title>MUSEngage | Admin control center</title>
        <meta
          name="description"
          content="Monitor events, manage inventory and moderate community activity across the MUSEngage platform."
        />
      </Helmet>
      <Box>
      <PageHero
        eyebrow="Administrator"
        title="Admin Control Center"
        description="Manage events, users, products and community posts from a single dashboard."
        theme="dashboard"
        ctaLabel="Refresh data"
        ctaHref="#admin"
        onCtaClick={(event) => {
          event.preventDefault();
          void (async () => {
            await Promise.all([
              fetchEvents(),
              fetchItems(),
              fetchRewards(),
              fetchPolls(),
              fetchCompetitions(),
              fetchUsers(),
              fetchPosts(),
              fetchModerationQueue(),
            ]);
          })();
        }}
      />

      <Container maxWidth="lg" id="admin" sx={{ py: { xs: 6, md: 8 } }}>
        <Tabs
          value={activeTab}
          onChange={(_event, value: TabKey) => setActiveTab(value)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Events" value="events" />
          <Tab label="Attendance" value="attendance" />
          <Tab label="Products" value="items" />
          <Tab label="Rewards" value="rewards" />
          <Tab label="Polls" value="polls" />
          <Tab label="Competitions" value="competitions" />
          <Tab label="Notifications" value="notifications" />
          <Tab label="Feedback" value="feedback" />
          <Tab label="Users" value="users" />
          <Tab label="Community" value="posts" />
          <Tab label="Rejected posts" value="postModeration" />
        </Tabs>

        <TabPanel value="events" current={activeTab}>
          <Stack spacing={4}>
            <Typography variant="body2" color="text.secondary">
              Use the floating action button to publish a new campus event.
            </Typography>

            <Stack spacing={2}>
              <Typography variant="h5">Existing events</Typography>
              {sortedEvents.length === 0 ? (
                <Alert severity="info">No events yet.</Alert>
              ) : (
                <Stack spacing={2}>
                  <TextField
                    label="Search events"
                    placeholder="Search by title"
                    value={eventsSearch}
                    onChange={(event) => setEventsSearch(event.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    }}
                  />
                  {filteredEvents.length === 0 ? (
                    <Alert severity="info">No events match your search.</Alert>
                  ) : (
                    <Stack spacing={2}>
                  {paginatedEvents.map((eventRecord) => (
                    <Accordion
                      key={eventRecord.id}
                      disableGutters
                      sx={{
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        '&:before': { display: 'none' },
                      }}
                    >
                      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2, py: 1.25, gap: 1 }}>
                        <Stack spacing={0.25} sx={{ flexGrow: 1, pr: 1 }}>
                          <Typography variant="subtitle1" fontWeight={600}>
                            {eventRecord.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Updated {formatDateTime(eventRecord.updatedAt)}
                          </Typography>
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <IconButton
                            aria-label="Edit event"
                            size="small"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setEventDialogForm({
                                ...eventRecord,
                                links:
                                  eventRecord.links.length > 0
                                    ? eventRecord.links.map((link) => ({ ...link }))
                                    : [createEmptyEventLink()],
                              });
                              setEventDialogOpen(true);
                            }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            aria-label="Delete event"
                            size="small"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void handleDeleteEvent(eventRecord.id);
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </AccordionSummary>
                      <AccordionDetails sx={{ px: 2, pb: 2 }}>
                        <Stack spacing={1.5}>
                          {eventRecord.subHeader ? (
                            <Typography variant="subtitle1" color="text.secondary">
                              {eventRecord.subHeader}
                            </Typography>
                          ) : null}
                          <Typography variant="body1">{eventRecord.body}</Typography>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip label={`Created ${formatDateTime(eventRecord.createdAt)}`} />
                            {eventRecord.url ? <Chip label="Has image" color="secondary" /> : null}
                            {eventRecord.hasRsvp ? (
                              <>
                                <Chip color="primary" label="RSVP enabled" />
                                <Chip
                                  variant="outlined"
                                  label={`${eventRecord.rsvpAttendees.length} RSVP${
                                    eventRecord.rsvpAttendees.length === 1 ? '' : 's'
                                  }`}
                                />
                                <Chip
                                  variant="outlined"
                                  label={`${eventRecord.rsvpRewardPoints} reward pts`}
                                />
                              </>
                            ) : (
                              <Chip label="RSVP disabled" variant="outlined" />
                            )}
                          </Stack>
                          {eventRecord.tags.length > 0 ? (
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                              {eventRecord.tags.map((tag) => (
                                <Chip
                                  key={`${eventRecord.id}-tag-${tag}`}
                                  label={tag}
                                  size="small"
                                  variant="outlined"
                                />
                              ))}
                            </Stack>
                          ) : null}
                          {eventRecord.links.length > 0 ? (
                            <Stack spacing={0.5}>
                              <Typography variant="subtitle2">Event links</Typography>
                              <Stack spacing={0.5}>
                                {eventRecord.links.map((link, index) => (
                                  <Link
                                    key={`${eventRecord.id}-link-${index}`}
                                    href={link.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {link.label}
                                  </Link>
                                ))}
                              </Stack>
                            </Stack>
                          ) : null}
                          {eventRecord.hasRsvp ? (
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
                              <Stack spacing={0.5}>
                                <Typography variant="body2" color="text.secondary">
                                  RSVP key: <code>{eventRecord.rsvpKey ?? 'Generating…'}</code>
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  Display or share this QR code to confirm attendance quickly.
                                </Typography>
                              </Stack>
                              <RsvpQrCodePreview
                                imageUrl={eventRecord.rsvpQrCodeUrl}
                                size={128}
                                downloadName={`event-${eventRecord.id}-rsvp.png`}
                              />
                            </Stack>
                          ) : null}
                        </Stack>
                      </AccordionDetails>
                    </Accordion>
                  ))}
                    </Stack>
                  )}
                  {filteredEvents.length > 0 && eventsPageCount > 1 ? (
                    <Pagination
                      count={eventsPageCount}
                      page={eventsPage}
                      onChange={(_event, value) => setEventsPage(value)}
                      color="primary"
                      sx={{ alignSelf: 'center' }}
                    />
                  ) : null}
                </Stack>
              )}
            </Stack>
          </Stack>
        </TabPanel>

        <TabPanel value="attendance" current={activeTab}>
          <Stack spacing={4}>
            <Typography variant="body2" color="text.secondary">
              Review RSVP respondents and confirm who has scanned their event QR codes for attendance.
            </Typography>

            {eventsWithRsvp.length === 0 ? (
              <Alert severity="info">Enable RSVP on an event to start tracking attendance scans.</Alert>
            ) : (
              <Stack spacing={2}>
                <TextField
                  label="Search events"
                  placeholder="Search by title"
                  value={attendanceEventSearch}
                  onChange={(event) => setAttendanceEventSearch(event.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
                {filteredAttendanceEvents.length === 0 ? (
                  <Alert severity="info">No attendance records match your search.</Alert>
                ) : (
                  <Stack spacing={2}>
                    {paginatedAttendanceEvents.map((eventRecord) => {
                  const attendedCount = eventRecord.rsvpAttendees.filter(
                    (attendee) => Boolean(attendee.rewardRedeemedAt),
                  ).length;
                  const hasAttendees = eventRecord.rsvpAttendees.length > 0;
                  const attendeeSearchValue = attendanceAttendeeSearch[eventRecord.id] ?? '';
                  const attendeeQuery = attendeeSearchValue.trim().toLowerCase();
                  const filteredAttendees = attendeeQuery
                    ? eventRecord.rsvpAttendees.filter((attendee) =>
                        `${attendee.userName ?? ''} ${attendee.userEmail}`
                          .toLowerCase()
                          .includes(attendeeQuery),
                      )
                    : eventRecord.rsvpAttendees;
                  const attendees = filteredAttendees;
                  const sortOrder = attendanceSortOrder[eventRecord.id] ?? 'none';
                  const sortedAttendees =
                    sortOrder === 'none'
                      ? attendees
                      : [...attendees].sort((a, b) => {
                          const aAttended = Boolean(a.rewardRedeemedAt);
                          const bAttended = Boolean(b.rewardRedeemedAt);
                          if (aAttended === bAttended) {
                            return a.userEmail.localeCompare(b.userEmail);
                          }
                          const attendedFirst = sortOrder === 'attended-first';
                          return attendedFirst === aAttended ? -1 : 1;
                        });
                  const rowsPerPage = attendanceRowsPerPage[eventRecord.id] ?? 6;
                  const currentPage = attendancePage[eventRecord.id] ?? 0;
                  const totalPages =
                    rowsPerPage > 0 ? Math.ceil(sortedAttendees.length / rowsPerPage) : 0;
                  const safePage = totalPages === 0 ? 0 : Math.min(currentPage, totalPages - 1);
                  const paginatedAttendees = sortedAttendees.slice(
                    safePage * rowsPerPage,
                    safePage * rowsPerPage + rowsPerPage,
                  );
                  const isExpanded = expandedAttendanceEventId === eventRecord.id;
                  return (
                    <Card key={`attendance-${eventRecord.id}`}>
                      <CardHeader
                        title={eventRecord.title}
                        subheader={`Updated ${formatDateTime(eventRecord.updatedAt)}`}
                        action={
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => handleToggleAttendance(eventRecord.id)}
                            disabled={!hasAttendees}
                          >
                            {isExpanded ? 'Hide attendance' : 'View attendance'}
                          </Button>
                        }
                      />
                      <CardContent>
                        <Stack spacing={2}>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip label={`${eventRecord.rsvpRewardPoints} reward pts`} color="primary" />
                            <Chip
                              label={`${eventRecord.rsvpAttendees.length} RSVP${
                                eventRecord.rsvpAttendees.length === 1 ? '' : 's'
                              }`}
                              variant="outlined"
                            />
                            <Chip
                              label={`${attendedCount} attendance ${attendedCount === 1 ? 'confirmation' : 'confirmations'}`}
                              color={attendedCount > 0 ? 'success' : 'default'}
                              variant={attendedCount > 0 ? 'filled' : 'outlined'}
                            />
                          </Stack>

                          {hasAttendees ? (
                            <>
                              {!isExpanded ? (
                                <Typography variant="body2" color="text.secondary">
                                  Select "View attendance" to browse RSVP respondents and scan details.
                                </Typography>
                              ) : null}
                              <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                <Stack spacing={2}>
                                  <TextField
                                    label="Search attendees"
                                    placeholder="Search by name or email"
                                    value={attendeeSearchValue}
                                    onChange={(event) => {
                                      const { value } = event.target;
                                      setAttendanceAttendeeSearch((prev) => ({
                                        ...prev,
                                        [eventRecord.id]: value,
                                      }));
                                      setAttendancePage((prev) => ({
                                        ...prev,
                                        [eventRecord.id]: 0,
                                      }));
                                    }}
                                    InputProps={{
                                      startAdornment: (
                                        <InputAdornment position="start">
                                          <SearchIcon fontSize="small" />
                                        </InputAdornment>
                                      ),
                                    }}
                                  />
                                  <TableContainer component={Paper} variant="outlined">
                                    <Table size="small" stickyHeader aria-label={`${eventRecord.title} attendance`}>
                                      <TableHead>
                                        <TableRow>
                                          <TableCell>Name</TableCell>
                                          <TableCell>Email</TableCell>
                                          <TableCell
                                            sortDirection=
                                              {sortOrder === 'none'
                                                ? false
                                                : sortOrder === 'pending-first'
                                                ? 'asc'
                                                : 'desc'}
                                          >
                                            <TableSortLabel
                                              active={sortOrder !== 'none'}
                                              direction={
                                                sortOrder === 'pending-first'
                                                  ? 'asc'
                                                  : sortOrder === 'attended-first'
                                                  ? 'desc'
                                                  : 'asc'
                                              }
                                              onClick={() => handleAttendanceStatusSortToggle(eventRecord.id)}
                                            >
                                              Status
                                            </TableSortLabel>
                                          </TableCell>
                                          <TableCell>Date scanned</TableCell>
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {paginatedAttendees.length === 0 ? (
                                          <TableRow>
                                            <TableCell colSpan={4} align="center">
                                              {attendees.length === 0
                                                ? 'No attendees match your search.'
                                                : 'No attendees to display.'}
                                            </TableCell>
                                          </TableRow>
                                        ) : (
                                          paginatedAttendees.map((attendee) => {
                                            const attended = Boolean(attendee.rewardRedeemedAt);
                                            const statusLabel = attended ? 'Attended' : 'Pending scan';
                                            return (
                                              <TableRow key={`${eventRecord.id}-attendee-${attendee.userId}`}>
                                                <TableCell>{attendee.userName || '—'}</TableCell>
                                                <TableCell>{attendee.userEmail}</TableCell>
                                                <TableCell>
                                                  <Chip
                                                    label={statusLabel}
                                                    color={attended ? 'success' : 'default'}
                                                    size="small"
                                                  />
                                                </TableCell>
                                                <TableCell>
                                                  {attended
                                                    ? formatDateTime(attendee.rewardRedeemedAt)
                                                    : '—'}
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })
                                        )}
                                      </TableBody>
                                    </Table>
                                  </TableContainer>
                                  <TablePagination
                                    component="div"
                                    rowsPerPageOptions={[6, 12, 24]}
                                    count={attendees.length}
                                    rowsPerPage={rowsPerPage}
                                    page={safePage}
                                    onPageChange={(_event, newPage) =>
                                      handleAttendancePageChange(eventRecord.id, newPage)
                                    }
                                    onRowsPerPageChange={(event) =>
                                      handleAttendanceRowsPerPageChange(
                                        eventRecord.id,
                                        Number(event.target.value),
                                      )
                                    }
                                  />
                                </Stack>
                              </Collapse>
                            </>
                          ) : (
                            <Alert severity="info">No RSVP respondents recorded yet.</Alert>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
                  </Stack>
                )}
                {filteredAttendanceEvents.length > 0 && attendanceEventsPageCount > 1 ? (
                  <Pagination
                    count={attendanceEventsPageCount}
                    page={attendanceEventsPage}
                    onChange={(_event, value) => setAttendanceEventsPage(value)}
                    color="primary"
                    sx={{ alignSelf: 'center' }}
                  />
                ) : null}
              </Stack>
            )}
          </Stack>
        </TabPanel>

        <TabPanel value="items" current={activeTab}>
          <Stack spacing={4}>
            <Typography variant="body2" color="text.secondary">
              Use the floating action button to add a new product to the shop.
            </Typography>

            <Stack spacing={2}>
              <Typography variant="h5">Products</Typography>
              {sortedItems.length === 0 ? (
                <Alert severity="info">No products yet.</Alert>
              ) : (
                <Stack spacing={2}>
                  <TextField
                    label="Search products"
                    placeholder="Search by title"
                    value={itemsSearch}
                    onChange={(event) => setItemsSearch(event.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    }}
                  />
                  {filteredItems.length === 0 ? (
                    <Alert severity="info">No products match your search.</Alert>
                  ) : (
                    <Stack spacing={2}>
                      {paginatedItems.map((item) => (
                    <Card key={item.id}>
                      <CardHeader
                        title={item.name}
                        subheader={`Updated ${formatDateTime(item.updatedAt)}`}
                        action={
                          <Stack direction="row" spacing={1}>
                            <IconButton
                              aria-label="Edit item"
                              onClick={() => {
                                setItemDialogForm(item);
                                setItemDialogOpen(true);
                              }}
                            >
                              <EditIcon />
                            </IconButton>
                            <IconButton aria-label="Delete item" onClick={() => void handleDeleteItem(item.id)}>
                              <DeleteIcon />
                            </IconButton>
                          </Stack>
                        }
                      />
                      <CardContent>
                        <Typography variant="body1" sx={{ mb: 1.5 }}>
                          {item.description || 'No description provided.'}
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          <Chip label={`Stock: ${item.availabilityCount}`} />
                          <Chip label={`Price: $${(item.price / 100).toFixed(2)}`} color="secondary" />
                          {item.url ? <Chip label="Has image" variant="outlined" /> : null}
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                    </Stack>
                  )}
                  {filteredItems.length > 0 && itemsPageCount > 1 ? (
                    <Pagination
                      count={itemsPageCount}
                      page={itemsPage}
                      onChange={(_event, value) => setItemsPage(value)}
                      color="primary"
                      sx={{ alignSelf: 'center' }}
                    />
                  ) : null}
                </Stack>
              )}
            </Stack>
          </Stack>
        </TabPanel>

        <TabPanel value="rewards" current={activeTab}>
          <Stack spacing={4}>
            <Typography variant="body2" color="text.secondary">
              Use the floating action button to add a new reward for students to redeem.
            </Typography>

            <Stack spacing={2}>
              <Typography variant="h5">Rewards</Typography>
              {sortedRewards.length === 0 ? (
                <Alert severity="info">No rewards yet.</Alert>
              ) : (
                <Stack spacing={2}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={2}
                    alignItems={{ sm: 'center' }}
                    justifyContent="space-between"
                  >
                    <TextField
                      label="Search rewards"
                      placeholder="Search by title"
                      value={rewardsSearch}
                      onChange={(event) => setRewardsSearch(event.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon fontSize="small" />
                          </InputAdornment>
                        ),
                      }}
                      sx={{ flex: 1 }}
                    />
                    <Button
                      variant="outlined"
                      startIcon={<QrCodeScannerIcon />}
                      component={RouterLink}
                      to="/reward-scanner"
                    >
                      Scan reward QR
                    </Button>
                  </Stack>
                  {filteredRewards.length === 0 ? (
                    <Alert severity="info">No rewards match your search.</Alert>
                  ) : (
                    <Stack spacing={2}>
                      {paginatedRewards.map((reward) => (
                    <Card key={reward.id}>
                      <CardHeader
                        title={`${reward.name} • ${reward.pointsCost} points`}
                        subheader={`${formatDateTime(reward.createdAt)} • ${reward.stock.toLocaleString()} in stock`}
                        action={
                          <Stack direction="row" spacing={1}>
                            <IconButton
                              aria-label="Edit reward"
                              onClick={() => {
                                setRewardDialogForm(reward);
                                setRewardDialogImageError(null);
                                setRewardDialogImageProgress(0);
                                setRewardDialogImageUploading(false);
                                setRewardDialogOpen(true);
                              }}
                            >
                              <EditIcon />
                            </IconButton>
                            <IconButton aria-label="Delete reward" onClick={() => void handleDeleteReward(reward.id)}>
                              <DeleteIcon />
                            </IconButton>
                          </Stack>
                        }
                      />
                      <CardContent>
                        <Typography variant="body2" color="text.secondary">
                          {reward.description || 'No description provided.'}
                        </Typography>
                      </CardContent>
                    </Card>
                  ))}
                    </Stack>
                  )}
                  {filteredRewards.length > 0 && rewardsPageCount > 1 ? (
                    <Pagination
                      count={rewardsPageCount}
                      page={rewardsPage}
                      onChange={(_event, value) => setRewardsPage(value)}
                      color="primary"
                      sx={{ alignSelf: 'center' }}
                    />
                  ) : null}
                </Stack>
              )}
            </Stack>
          </Stack>
        </TabPanel>

        <TabPanel value="polls" current={activeTab}>
          <Stack spacing={4}>
            <Typography variant="body2" color="text.secondary">
              Use the floating action button to launch a new poll.
            </Typography>

            <Stack spacing={2}>
              <Typography variant="h5">Polls</Typography>
              {sortedPolls.length === 0 ? (
                <Alert severity="info">No polls yet.</Alert>
              ) : (
                <Stack spacing={2}>
                  <TextField
                    label="Search polls"
                    placeholder="Search by question"
                    value={pollsSearch}
                    onChange={(event) => setPollsSearch(event.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    }}
                  />
                  {filteredPolls.length === 0 ? (
                    <Alert severity="info">No polls match your search.</Alert>
                  ) : (
                    <Stack spacing={2}>
                      {paginatedPolls.map((poll) => (
                    <Card key={poll.id}>
                      <CardHeader
                        title={poll.question}
                        subheader={`Total votes: ${poll.totalVotes}`}
                        action={
                          <Stack direction="row" spacing={1}>
                            <IconButton
                              aria-label="Edit poll"
                              disabled={poll.isFinalized}
                              onClick={() => {
                                setPollDialogForm(poll);
                                setPollDialogOptions(
                                  poll.options.length > 0 ? [...poll.options] : ['', ''],
                                );
                                setPollDialogImageError(null);
                                setPollDialogImageProgress(0);
                                setPollDialogImageUploading(false);
                                setPollDialogOpen(true);
                              }}
                            >
                              <EditIcon />
                            </IconButton>
                            <Button
                              variant="outlined"
                              size="small"
                              disabled={poll.isFinalized}
                              onClick={() => void handleFinalizePoll(poll.id)}
                            >
                              Finalize
                            </Button>
                            <IconButton aria-label="Delete poll" onClick={() => void handleDeletePoll(poll.id)}>
                              <DeleteIcon />
                            </IconButton>
                          </Stack>
                        }
                      />
                      <CardContent>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                          <Chip label={poll.isFinalized ? 'Finalized' : 'Open'} color={poll.isFinalized ? 'success' : 'warning'} />
                          {poll.rewardPoints > 0 ? (
                            <Chip
                              label={`${poll.rewardPoints} reward point${poll.rewardPoints === 1 ? '' : 's'}`}
                              color="primary"
                              variant="outlined"
                            />
                          ) : null}
                          {poll.isFinalized && poll.rewardPoints > 0 ? (
                            <Chip
                              label={poll.rewardPointsAwarded ? 'Points awarded' : 'Pending award'}
                              color={poll.rewardPointsAwarded ? 'success' : 'warning'}
                            />
                          ) : null}
                          <Chip label={`Created ${formatDateTime(poll.createdAt)}`} variant="outlined" />
                          {poll.finalizedAt ? <Chip label={`Finalized ${formatDateTime(poll.finalizedAt)}`} variant="outlined" /> : null}
                        </Stack>
                        {poll.results && poll.results.length > 0 ? (
                          <Stack spacing={2}>
                            {poll.rewardPoints > 0 ? (
                              <Typography variant="body2" color="text.secondary">
                                {poll.rewardPointsAwarded
                                  ? `Participants earned ${poll.rewardPoints} reward point${
                                      poll.rewardPoints === 1 ? '' : 's'
                                    } when this poll was finalised.`
                                  : `This poll awards ${poll.rewardPoints} reward point${
                                      poll.rewardPoints === 1 ? '' : 's'
                                    } to participants.`}
                              </Typography>
                            ) : null}
                            {poll.results.map((result) => {
                              const percent = poll.totalVotes ? Math.round((result.votes / poll.totalVotes) * 100) : 0;
                              return (
                                <Box key={`${poll.id}-${result.option}`}>
                                  <Typography variant="subtitle2">{result.option}</Typography>
                                  <LinearProgress
                                    variant="determinate"
                                    value={poll.totalVotes ? (result.votes / poll.totalVotes) * 100 : 0}
                                    sx={{ mt: 1, mb: 0.5 }}
                                  />
                                  <Typography variant="caption" color="text.secondary">
                                    {result.votes} vote{result.votes === 1 ? '' : 's'} ({percent}%)
                                  </Typography>
                                </Box>
                              );
                            })}
                          </Stack>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            Poll is open. Results will appear after finalization.
                            {poll.rewardPoints > 0
                              ? ` Voters will receive ${poll.rewardPoints} reward point${
                                  poll.rewardPoints === 1 ? '' : 's'
                                } when the poll closes.`
                              : ''}
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                    </Stack>
                  )}
                  {filteredPolls.length > 0 && pollsPageCount > 1 ? (
                    <Pagination
                      count={pollsPageCount}
                      page={pollsPage}
                      onChange={(_event, value) => setPollsPage(value)}
                      color="primary"
                      sx={{ alignSelf: 'center' }}
                    />
                  ) : null}
                </Stack>
              )}
            </Stack>
          </Stack>
        </TabPanel>

        <TabPanel value="competitions" current={activeTab}>
          <Stack spacing={4}>
            <Typography variant="body2" color="text.secondary">
              Use the floating action button to publish a new competition.
            </Typography>

            <Stack spacing={2}>
              <Typography variant="h5">Competitions</Typography>
              {sortedCompetitions.length === 0 ? (
                <Alert severity="info">No competitions yet.</Alert>
              ) : (
                <Stack spacing={2}>
                  <TextField
                    label="Search competitions"
                    placeholder="Search by title"
                    value={competitionsSearch}
                    onChange={(event) => setCompetitionsSearch(event.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    }}
                  />
                  {filteredCompetitions.length === 0 ? (
                    <Alert severity="info">No competitions match your search.</Alert>
                  ) : (
                    <Stack spacing={2}>
                      {paginatedCompetitions.map((competition) => (
                    <Card key={competition.id}>
                      <CardHeader
                        title={competition.title}
                        subheader={`Submissions: ${competition.submissionCount}`}
                        action={
                          <Stack direction="row" spacing={1}>
                            <IconButton
                              aria-label="Edit competition"
                              onClick={() => {
                                setCompetitionDialogForm(competition);
                                setCompetitionDialogImageError(null);
                                setCompetitionDialogImageProgress(0);
                                setCompetitionDialogImageUploading(false);
                                setCompetitionDialogOpen(true);
                              }}
                            >
                              <EditIcon />
                            </IconButton>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => void handleViewSubmissions(competition)}
                            >
                              View submissions
                            </Button>
                            <IconButton
                              aria-label="Delete competition"
                              onClick={() => void handleDeleteCompetition(competition.id)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Stack>
                        }
                      />
                      <CardContent>
                        <Stack spacing={1.5}>
                          <Typography variant="subtitle1" color="text.secondary">
                            {competition.summary}
                          </Typography>
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                            {competition.details}
                          </Typography>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={competition.isActive}
                                onChange={(event) => void handleToggleCompetitionActive(competition, event.target.checked)}
                              />
                            }
                            label={competition.isActive ? 'Accepting submissions' : 'Closed'}
                          />
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip label={`Created ${formatDateTime(competition.createdAt)}`} variant="outlined" />
                            {competition.updatedAt ? (
                              <Chip label={`Updated ${formatDateTime(competition.updatedAt)}`} variant="outlined" />
                            ) : null}
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                    </Stack>
                  )}
                  {filteredCompetitions.length > 0 && competitionsPageCount > 1 ? (
                    <Pagination
                      count={competitionsPageCount}
                      page={competitionsPage}
                      onChange={(_event, value) => setCompetitionsPage(value)}
                      color="primary"
                      sx={{ alignSelf: 'center' }}
                    />
                  ) : null}
                </Stack>
              )}
            </Stack>
          </Stack>
        </TabPanel>

        <TabPanel value="notifications" current={activeTab}>
          <Stack spacing={3} maxWidth={640}>
            <Stack spacing={1}>
              <Typography variant="h5">Broadcast notification</Typography>
              <Typography variant="body2" color="text.secondary">
                Send a custom message to every registered user (guests are excluded). Use this for urgent campus updates
                or important announcements.
              </Typography>
            </Stack>
            <Box component="form" onSubmit={handleBroadcastNotification}>
              <Stack spacing={2}>
                {adminNotificationStatus ? (
                  <Alert severity={adminNotificationStatus.type}>{adminNotificationStatus.message}</Alert>
                ) : null}
                <TextField
                  label="Notification title"
                  value={adminNotificationTitle}
                  onChange={(event) => setAdminNotificationTitle(event.target.value)}
                  required
                  inputProps={{ maxLength: 120 }}
                />
                <TextField
                  label="Message"
                  value={adminNotificationBody}
                  onChange={(event) => setAdminNotificationBody(event.target.value)}
                  required
                  multiline
                  minRows={4}
                  inputProps={{ maxLength: 500 }}
                />
                <Stack direction="row" justifyContent="flex-end">
                  <Button type="submit" variant="contained" disabled={adminNotificationSubmitting}>
                    {adminNotificationSubmitting ? 'Sending…' : 'Send notification'}
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </Stack>
        </TabPanel>

        <TabPanel value="feedback" current={activeTab}>
          <Stack spacing={2}>
            <Typography variant="h5">Feedback submissions</Typography>
            {sortedFeedback.length === 0 ? (
              <Alert severity="info">No feedback submissions yet.</Alert>
            ) : (
              <Stack spacing={2}>
                <TextField
                  label="Search feedback"
                  placeholder="Search by message or user"
                  value={feedbackSearch}
                  onChange={(event) => setFeedbackSearch(event.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
                {filteredFeedback.length === 0 ? (
                  <Alert severity="info">No feedback matches your search.</Alert>
                ) : (
                  <Stack spacing={2}>
                    {paginatedFeedback.map((record) => {
                    const statusOptions = feedbackStatuses.length > 0
                      ? feedbackStatuses
                      : [record.status];
                    return (
                      <Card key={record.id}>
                      <CardHeader
                        title={record.userName || record.userEmail}
                        subheader={`${record.userEmail} • ${formatDateTime(record.createdAt)}`}
                        action={
                          <IconButton
                            aria-label="Delete feedback"
                            onClick={() => void handleDeleteFeedback(record.id)}
                            disabled={feedbackDeletingId === record.id}
                          >
                            <DeleteIcon />
                          </IconButton>
                        }
                      />
                      <CardContent>
                        <Stack spacing={2}>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip
                              label={record.status}
                              color={getFeedbackStatusColor(record.status)}
                            />
                            <Chip
                              label={`Last updated ${formatDateTime(record.updatedAt)}`}
                              variant="outlined"
                            />
                            {record.category ? (
                              <Chip label={record.category} variant="outlined" />
                            ) : null}
                          </Stack>
                          <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                            {record.message}
                          </Typography>
                          <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={2}
                            alignItems={{ sm: 'center' }}
                          >
                            <Select
                              size="small"
                              value={record.status}
                              onChange={(event) =>
                                handleUpdateFeedbackStatus(record.id, event.target.value as string)
                              }
                              disabled={feedbackUpdatingId === record.id}
                              sx={{ minWidth: 200 }}
                            >
                              {statusOptions.map((statusOption) => (
                                <MenuItem key={statusOption} value={statusOption}>
                                  {statusOption}
                                </MenuItem>
                              ))}
                            </Select>
                            {feedbackUpdatingId === record.id ? (
                              <LinearProgress sx={{ flex: 1, minWidth: 160 }} />
                            ) : null}
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
                  </Stack>
                )}
                {filteredFeedback.length > 0 && feedbackPageCount > 1 ? (
                  <Pagination
                    count={feedbackPageCount}
                    page={feedbackPage}
                    onChange={(_event, value) => setFeedbackPage(value)}
                    color="primary"
                    sx={{ alignSelf: 'center' }}
                  />
                ) : null}
              </Stack>
            )}
          </Stack>
        </TabPanel>

        <TabPanel value="users" current={activeTab}>
          <Stack spacing={4}>
            <Typography variant="body2" color="text.secondary">
              Use the floating action button to invite a new user.
            </Typography>

            <Stack spacing={2}>
              <Typography variant="h5">Users</Typography>
              {users.length === 0 ? (
                <Alert severity="info">No users found.</Alert>
              ) : (
                <Stack spacing={2}>
                  <TextField
                    label="Search users"
                    placeholder="Search by name"
                    value={usersSearch}
                    onChange={(event) => setUsersSearch(event.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    }}
                  />
                  {filteredUsers.length === 0 ? (
                    <Alert severity="info">No users match your search.</Alert>
                  ) : (
                    <Stack spacing={2}>
                      {paginatedUsers.map((userRecord) => (
                    <Card key={userRecord.id}>
                      <CardContent>
                        <Stack spacing={2}>
                          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Typography variant="h6" sx={{ wordBreak: 'break-word' }}>
                                {userRecord.name} ({userRecord.role})
                              </Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                                {userRecord.email}
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                              <IconButton
                                aria-label="Edit user"
                                size="small"
                                onClick={() => {
                                  setUserDialogForm(userRecord);
                                  setUserDialogOpen(true);
                                }}
                              >
                                <EditIcon />
                              </IconButton>
                              <IconButton
                                aria-label="Delete user"
                                size="small"
                                onClick={() => void handleDeleteUser(userRecord.id)}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Stack>
                          </Stack>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip
                              label={`${userRecord.rewardPoints} reward pts`}
                              variant="outlined"
                              color="secondary"
                            />
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                    </Stack>
                  )}
                  {filteredUsers.length > 0 && usersPageCount > 1 ? (
                    <Pagination
                      count={usersPageCount}
                      page={usersPage}
                      onChange={(_event, value) => setUsersPage(value)}
                      color="primary"
                      sx={{ alignSelf: 'center' }}
                    />
                  ) : null}
                </Stack>
              )}
            </Stack>
          </Stack>
        </TabPanel>

        <TabPanel value="postModeration" current={activeTab}>
          <Stack spacing={2}>
            <Typography variant="h5">Posts awaiting review</Typography>
            {!isAdmin ? (
              <Alert severity="info">Log in as an admin to approve or reject posts.</Alert>
            ) : null}
            {sortedModerationQueue.length === 0 ? (
              <Alert severity="success">No rejected posts need attention.</Alert>
            ) : (
              <Stack spacing={2}>
                <TextField
                  label="Search rejected posts"
                  placeholder="Search by title"
                  value={moderationSearch}
                  onChange={(event) => setModerationSearch(event.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
                {filteredModeration.length === 0 ? (
                  <Alert severity="info">No rejected posts match your search.</Alert>
                ) : (
                  <Stack spacing={2}>
                    {paginatedModeration.map((record) => (
                  <Card key={record.id}>
                    <CardHeader
                      title={record.title || 'Untitled post'}
                      subheader={`${record.authorName} • ${record.authorEmail}`}
                    />
                    <CardContent>
                      <Stack spacing={2}>
                        <Alert severity="warning">{record.reason}</Alert>
                        {record.categories.length > 0 ? (
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            {record.categories.map((category) => (
                              <Chip key={`${record.id}-category-${category}`} label={category} size="small" color="warning" />
                            ))}
                          </Stack>
                        ) : null}
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {record.content}
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          <Chip label={`Submitted ${formatDateTime(record.submittedAt)}`} variant="outlined" />
                          {record.flair ? <Chip label={record.flair} color="secondary" /> : null}
                          {record.imageUrl ? <Chip label="Contains image" variant="outlined" color="info" /> : null}
                        </Stack>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                          <Button
                            variant="contained"
                            onClick={() => void handleApproveModeratedPost(record)}
                            disabled={!isAdmin || moderationActionId === record.id}
                          >
                            Approve &amp; publish
                          </Button>
                          <Button
                            variant="outlined"
                            color="error"
                            onClick={() => void handleRejectModeratedPost(record)}
                            disabled={!isAdmin || moderationActionId === record.id}
                          >
                            Keep rejected
                          </Button>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
                  </Stack>
                )}
                {filteredModeration.length > 0 && moderationPageCount > 1 ? (
                  <Pagination
                    count={moderationPageCount}
                    page={moderationPage}
                    onChange={(_event, value) => setModerationPage(value)}
                    color="primary"
                    sx={{ alignSelf: 'center' }}
                  />
                ) : null}
              </Stack>
            )}
          </Stack>
        </TabPanel>

        <TabPanel value="posts" current={activeTab}>
          <Stack spacing={2}>
            <Typography variant="h5">Community posts</Typography>
            {sortedPosts.length === 0 ? (
              <Alert severity="info">No community posts yet.</Alert>
            ) : (
              <Stack spacing={2}>
                <TextField
                  label="Search posts"
                  placeholder="Search by title"
                  value={postsSearch}
                  onChange={(event) => setPostsSearch(event.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
                {filteredPosts.length === 0 ? (
                  <Alert severity="info">No posts match your search.</Alert>
                ) : (
                  <Stack spacing={2}>
                    {paginatedPosts.map((post) => (
                  <Card key={post.id}>
                    <CardHeader
                      title={post.title}
                      subheader={`${post.authorName} • ${post.authorEmail}`}
                      action={
                        <Stack direction="row" spacing={1}>
                          <IconButton
                            aria-label="Edit post"
                            onClick={() => {
                              setPostDialogForm(post);
                              setPostDialogOpen(true);
                            }}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton aria-label="Delete post" onClick={() => void handleDeletePost(post.id)}>
                            <DeleteIcon />
                          </IconButton>
                        </Stack>
                      }
                    />
                    <CardContent>
                      <Typography variant="body1" sx={{ mb: 1.5 }}>
                        {post.content}
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                        <Chip label={`Created ${formatDateTime(post.createdAt)}`} />
                        {post.updatedAt ? <Chip label={`Updated ${formatDateTime(post.updatedAt)}`} /> : null}
                        {post.flair ? <Chip label={post.flair} color="secondary" /> : null}
                        <Chip label={`${post.comments.length} comments`} variant="outlined" />
                      </Stack>
                      <Divider sx={{ mb: 2 }} />
                      <Stack spacing={1.5}>
                        {post.comments.length === 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            No comments.
                          </Typography>
                        ) : (
                          post.comments.map((comment) => (
                            <Box key={comment.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                              <Box>
                                <Typography variant="subtitle2">
                                  {comment.authorName}
                                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                    {formatDateTime(comment.createdAt)}
                                  </Typography>
                                </Typography>
                                <Typography variant="body2">{comment.content}</Typography>
                              </Box>
                              <IconButton
                                aria-label="Delete comment"
                                onClick={() => void handleDeleteComment(post.id, comment.id)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          ))
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
                  </Stack>
                )}
                {filteredPosts.length > 0 && postsPageCount > 1 ? (
                  <Pagination
                    count={postsPageCount}
                    page={postsPage}
                    onChange={(_event, value) => setPostsPage(value)}
                    color="primary"
                    sx={{ alignSelf: 'center' }}
                  />
                ) : null}
              </Stack>
            )}
          </Stack>
        </TabPanel>
      </Container>

      {creationFabConfig && !fabHidden ? (
        <Fab
          color="primary"
          aria-label={creationFabConfig.label}
          onClick={creationFabConfig.onClick}
          sx={{
            position: 'fixed',
            bottom: { xs: 88, sm: 32 },
            right: { xs: 16, sm: 32 },
            zIndex: (theme) => theme.zIndex.tooltip,
          }}
        >
          <AddIcon />
        </Fab>
      ) : null}

      <Dialog
        open={createEventOpen}
        onClose={handleCloseCreateEvent}
        fullWidth
        maxWidth="md"
        aria-labelledby="create-event-dialog"
      >
        <Box component="form" onSubmit={handleCreateEvent}>
          <DialogTitle id="create-event-dialog">Create new event</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <TextField
                label="Title"
                value={eventForm.title}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setEventForm((prev) => ({ ...prev, title: event.target.value }))
                }
                required
              />
              <TextField
                label="Sub-header"
                value={eventForm.subHeader}
                onChange={(event) => setEventForm((prev) => ({ ...prev, subHeader: event.target.value }))}
              />
              <TextField
                label="Body"
                multiline
                minRows={4}
                value={eventForm.body}
                onChange={(event) => setEventForm((prev) => ({ ...prev, body: event.target.value }))}
                required
              />
              <Autocomplete
                multiple
                freeSolo
                options={EVENT_TAG_OPTIONS}
                filterSelectedOptions
                value={eventForm.tags}
                onChange={(_event, value) => {
                  const cleaned = value
                    .map((tag) => tag.trim())
                    .filter((tag) => Boolean(tag));
                  const unique = Array.from(new Map(cleaned.map((tag) => [tag.toLowerCase(), tag])).values()).slice(
                    0,
                    MAX_EVENT_TAGS,
                  );
                  setEventForm((prev) => ({ ...prev, tags: unique }));
                }}
                renderTags={(tagValue, getTagProps) =>
                  tagValue.map((option, index) => <Chip {...getTagProps({ index })} label={option} size="small" />)
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Tags"
                    placeholder="Add categories such as Career or Community"
                    helperText={`Select up to ${MAX_EVENT_TAGS} tags to help the recommendation engine.`}
                  />
                )}
              />
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                  <Button variant="outlined" component="label" disabled={eventImageUploading}>
                    {eventForm.url ? 'Replace image' : 'Upload image'}
                    <input type="file" accept="image/*" hidden onChange={handleEventImageSelect} />
                  </Button>
                  {eventImageUploading ? (
                    <Chip color="primary" variant="outlined" label="Uploading…" />
                  ) : eventForm.url ? (
                    <Chip color="success" label="Image ready" />
                  ) : null}
                  {eventForm.url ? (
                    <Button
                      color="inherit"
                      disabled={eventImageUploading}
                      onClick={() => {
                        setEventForm((prev) => ({ ...prev, url: '' }));
                        setEventImageUploadProgress(0);
                        setEventImageError(null);
                      }}
                    >
                      Remove image
                    </Button>
                  ) : null}
                </Stack>
                {eventImageUploading ? (
                  <LinearProgress
                    variant={eventImageUploadProgress > 0 ? 'determinate' : 'indeterminate'}
                    value={eventImageUploadProgress > 0 ? eventImageUploadProgress : undefined}
                    sx={{ maxWidth: 320 }}
                  />
                ) : null}
                {eventImageError ? <FormHelperText error>{eventImageError}</FormHelperText> : null}
                <TextField
                  label="Image URL (optional)"
                  value={eventForm.url}
                  onChange={(event) => setEventForm((prev) => ({ ...prev, url: event.target.value }))}
                  placeholder="Paste an existing image link or upload above"
                />
              </Stack>
              <Stack spacing={1.5}>
                <Stack spacing={0.5}>
                  <Typography variant="subtitle1">Event links</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Share registration forms, livestream URLs or supporting resources for attendees.
                  </Typography>
                </Stack>
                <Stack spacing={1.5}>
                  {eventForm.links.map((link, index) => (
                    <Stack
                      key={`event-link-${index}`}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1.5}
                      alignItems={{ sm: 'center' }}
                    >
                      <TextField
                        label="Link label"
                        value={link.label}
                        onChange={(event) => handleEventLinkChange(index, 'label', event.target.value)}
                        placeholder="e.g. Register here"
                        fullWidth
                      />
                      <TextField
                        label="Link URL"
                        type="url"
                        value={link.url}
                        onChange={(event) => handleEventLinkChange(index, 'url', event.target.value)}
                        placeholder="https://example.com"
                        fullWidth
                      />
                      <IconButton aria-label="Remove link" onClick={() => handleRemoveEventLink(index)} color="inherit">
                        <RemoveCircleOutlineIcon />
                      </IconButton>
                    </Stack>
                  ))}
                </Stack>
                <Button variant="outlined" size="small" startIcon={<AddCircleOutlineIcon />} onClick={handleAddEventLink}>
                  Add link
                </Button>
              </Stack>
              <Stack spacing={1}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={eventForm.hasRsvp}
                      onChange={(_, checked) =>
                        setEventForm((prev) => ({
                          ...prev,
                          hasRsvp: checked,
                          rsvpRewardPoints: checked ? prev.rsvpRewardPoints : 0,
                        }))
                      }
                    />
                  }
                  label="Enable RSVP collection"
                />
                {eventForm.hasRsvp ? (
                  <TextField
                    label="Reward points for attendees"
                    type="number"
                    inputProps={{ min: 0 }}
                    value={eventForm.rsvpRewardPoints}
                    onChange={(event) =>
                      setEventForm((prev) => ({
                        ...prev,
                        rsvpRewardPoints: Number(event.target.value),
                      }))
                    }
                    helperText="Points awarded when attendance is confirmed via QR."
                  />
                ) : null}
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseCreateEvent} disabled={creatingEvent || eventImageUploading}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={creatingEvent || eventImageUploading}>
              {creatingEvent ? 'Creating…' : 'Create event'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={createItemOpen}
        onClose={handleCloseCreateItem}
        fullWidth
        maxWidth="sm"
        aria-labelledby="create-item-dialog"
      >
        <Box component="form" onSubmit={handleCreateItem}>
          <DialogTitle id="create-item-dialog">Add product</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <TextField
                label="Name"
                value={itemForm.name}
                onChange={(event) => setItemForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
              <TextField
                label="Description"
                multiline
                minRows={3}
                value={itemForm.description}
                onChange={(event) => setItemForm((prev) => ({ ...prev, description: event.target.value }))}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Stock"
                  type="number"
                  value={itemForm.availabilityCount}
                  onChange={(event) => setItemForm((prev) => ({ ...prev, availabilityCount: Number(event.target.value) }))}
                  inputProps={{ min: 0 }}
                  required
                />
                <TextField
                  label="Price (in cents)"
                  type="number"
                  value={itemForm.price}
                  onChange={(event) => setItemForm((prev) => ({ ...prev, price: Number(event.target.value) }))}
                  inputProps={{ min: 0 }}
                  required
                />
              </Stack>
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                  <Button variant="outlined" component="label" disabled={itemImageUploading}>
                    {itemForm.url ? 'Replace image' : 'Upload image'}
                    <input type="file" accept="image/*" hidden onChange={handleItemImageSelect} />
                  </Button>
                  {itemImageUploading ? (
                    <Chip color="primary" variant="outlined" label="Uploading…" />
                  ) : itemForm.url ? (
                    <Chip color="success" label="Image ready" />
                  ) : null}
                  {itemForm.url ? (
                    <Button
                      color="inherit"
                      disabled={itemImageUploading}
                      onClick={() => {
                        setItemForm((prev) => ({ ...prev, url: '' }));
                        setItemImageUploadProgress(0);
                        setItemImageError(null);
                      }}
                    >
                      Remove image
                    </Button>
                  ) : null}
                </Stack>
                {itemImageUploading ? (
                  <LinearProgress
                    variant={itemImageUploadProgress > 0 ? 'determinate' : 'indeterminate'}
                    value={itemImageUploadProgress > 0 ? itemImageUploadProgress : undefined}
                    sx={{ maxWidth: 320 }}
                  />
                ) : null}
                {itemImageError ? <FormHelperText error>{itemImageError}</FormHelperText> : null}
                <TextField
                  label="Image URL (optional)"
                  value={itemForm.url}
                  onChange={(event) => setItemForm((prev) => ({ ...prev, url: event.target.value }))}
                  placeholder="Paste an image link or upload above"
                />
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseCreateItem} disabled={creatingItem || itemImageUploading}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={creatingItem || itemImageUploading}>
              {creatingItem ? 'Creating…' : 'Create item'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={createRewardOpen}
        onClose={handleCloseCreateReward}
        fullWidth
        maxWidth="sm"
        aria-labelledby="create-reward-dialog"
      >
        <Box component="form" onSubmit={handleCreateReward}>
          <DialogTitle id="create-reward-dialog">Create reward</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <TextField
                label="Name"
                value={rewardForm.name}
                onChange={(event) => setRewardForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
              <TextField
                label="Description"
                multiline
                minRows={3}
                value={rewardForm.description}
                onChange={(event) => setRewardForm((prev) => ({ ...prev, description: event.target.value }))}
              />
              <TextField
                label="Points cost"
                type="number"
                value={rewardForm.pointsCost}
                onChange={(event) =>
                  setRewardForm((prev) => ({ ...prev, pointsCost: Math.max(0, Number(event.target.value)) }))
                }
                inputProps={{ min: 0 }}
                required
              />
              <TextField
                label="Stock available"
                type="number"
                value={rewardForm.stock}
                onChange={(event) =>
                  setRewardForm((prev) => ({ ...prev, stock: Math.max(0, Number(event.target.value)) }))
                }
                inputProps={{ min: 0 }}
                required
              />
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                  <Button variant="outlined" component="label" disabled={rewardImageUploading}>
                    {rewardForm.imageUrl ? 'Replace image' : 'Upload image'}
                    <input type="file" accept="image/*" hidden onChange={handleRewardImageSelect} />
                  </Button>
                  {rewardImageUploading ? (
                    <Chip color="primary" variant="outlined" label="Uploading…" />
                  ) : rewardForm.imageUrl ? (
                    <Chip color="success" label="Image ready" />
                  ) : null}
                  {rewardForm.imageUrl ? (
                    <Button
                      color="inherit"
                      disabled={rewardImageUploading}
                      onClick={() => {
                        setRewardForm((prev) => ({ ...prev, imageUrl: '' }));
                        setRewardImageUploadProgress(0);
                        setRewardImageError(null);
                      }}
                    >
                      Remove image
                    </Button>
                  ) : null}
                </Stack>
                {rewardImageUploading ? (
                  <LinearProgress
                    variant={rewardImageUploadProgress > 0 ? 'determinate' : 'indeterminate'}
                    value={rewardImageUploadProgress > 0 ? rewardImageUploadProgress : undefined}
                    sx={{ maxWidth: 320 }}
                  />
                ) : null}
                {rewardImageError ? <FormHelperText error>{rewardImageError}</FormHelperText> : null}
                <TextField
                  label="Image URL (optional)"
                  value={rewardForm.imageUrl}
                  onChange={(event) => setRewardForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
                  placeholder="Paste an image link or upload above"
                />
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseCreateReward} disabled={creatingReward || rewardImageUploading}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={creatingReward || rewardImageUploading}>
              {creatingReward ? 'Creating…' : 'Create reward'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={createPollOpen}
        onClose={handleCloseCreatePoll}
        fullWidth
        maxWidth="sm"
        aria-labelledby="create-poll-dialog"
      >
        <Box component="form" onSubmit={handleCreatePoll}>
          <DialogTitle id="create-poll-dialog">Create poll</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <TextField
                label="Question"
                value={pollForm.question}
                onChange={(event) => setPollForm((prev) => ({ ...prev, question: event.target.value }))}
                required
              />
              <Stack spacing={1.5}>
                <Stack spacing={0.5}>
                  <Typography variant="subtitle1">Options</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Provide at least two options. You can add up to five choices.
                  </Typography>
                </Stack>
                <Stack spacing={1}>
                  {pollForm.options.map((option, index) => (
                    <Stack key={`poll-option-${index}`} direction="row" spacing={1} alignItems="center">
                      <TextField
                        label={`Option ${index + 1}`}
                        value={option}
                        onChange={(event) => handleUpdatePollOption(index, event.target.value)}
                        fullWidth
                        required={index < 2}
                      />
                      <IconButton
                        aria-label="Remove option"
                        onClick={() => handleRemovePollOption(index)}
                        disabled={pollForm.options.length <= 2}
                      >
                        <RemoveCircleOutlineIcon />
                      </IconButton>
                    </Stack>
                  ))}
                </Stack>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddCircleOutlineIcon />}
                  onClick={handleAddPollOption}
                  disabled={pollForm.options.length >= 5}
                >
                  Add option
                </Button>
              </Stack>
              <TextField
                label="Reward points per participant"
                type="number"
                inputProps={{ min: 0 }}
                value={pollForm.rewardPoints}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setPollForm((prev) => ({
                    ...prev,
                    rewardPoints: Number.isNaN(value) ? 0 : Math.max(0, Math.floor(value)),
                  }));
                }}
                helperText="Students earn these points after the poll is finalised."
              />
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                  <Button variant="outlined" component="label" disabled={pollImageUploading}>
                    {pollForm.imageUrl ? 'Replace image' : 'Upload image'}
                    <input type="file" accept="image/*" hidden onChange={handlePollImageSelect} />
                  </Button>
                  {pollImageUploading ? (
                    <Chip color="primary" variant="outlined" label="Uploading…" />
                  ) : pollForm.imageUrl ? (
                    <Chip color="success" label="Image ready" />
                  ) : null}
                  {pollForm.imageUrl ? (
                    <Button
                      color="inherit"
                      disabled={pollImageUploading}
                      onClick={() => {
                        setPollForm((prev) => ({ ...prev, imageUrl: '' }));
                        setPollImageUploadProgress(0);
                        setPollImageError(null);
                      }}
                    >
                      Remove image
                    </Button>
                  ) : null}
                </Stack>
                {pollImageUploading ? (
                  <LinearProgress
                    variant={pollImageUploadProgress > 0 ? 'determinate' : 'indeterminate'}
                    value={pollImageUploadProgress > 0 ? pollImageUploadProgress : undefined}
                    sx={{ maxWidth: 320 }}
                  />
                ) : null}
                {pollImageError ? <FormHelperText error>{pollImageError}</FormHelperText> : null}
                <TextField
                  label="Image URL (optional)"
                  value={pollForm.imageUrl}
                  onChange={(event) => setPollForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
                  placeholder="Paste an image link or upload above"
                />
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseCreatePoll} disabled={creatingPoll || pollImageUploading}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={creatingPoll || pollImageUploading}>
              {creatingPoll ? 'Creating…' : 'Create poll'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={createCompetitionOpen}
        onClose={handleCloseCreateCompetition}
        fullWidth
        maxWidth="md"
        aria-labelledby="create-competition-dialog"
      >
        <Box component="form" onSubmit={handleCreateCompetition}>
          <DialogTitle id="create-competition-dialog">Create competition</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <TextField
                label="Title"
                value={competitionForm.title}
                onChange={(event) => setCompetitionForm((prev) => ({ ...prev, title: event.target.value }))}
                required
              />
              <TextField
                label="Summary"
                value={competitionForm.summary}
                onChange={(event) => setCompetitionForm((prev) => ({ ...prev, summary: event.target.value }))}
                required
              />
              <TextField
                label="Details"
                multiline
                minRows={4}
                value={competitionForm.details}
                onChange={(event) => setCompetitionForm((prev) => ({ ...prev, details: event.target.value }))}
                required
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={competitionForm.isActive}
                    onChange={(_, checked) => setCompetitionForm((prev) => ({ ...prev, isActive: checked }))}
                  />
                }
                label={competitionForm.isActive ? 'Accepting submissions' : 'Closed'}
              />
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                  <Button variant="outlined" component="label" disabled={competitionImageUploading}>
                    {competitionForm.imageUrl ? 'Replace image' : 'Upload image'}
                    <input type="file" accept="image/*" hidden onChange={handleCompetitionImageSelect} />
                  </Button>
                  {competitionImageUploading ? (
                    <Chip color="primary" variant="outlined" label="Uploading…" />
                  ) : competitionForm.imageUrl ? (
                    <Chip color="success" label="Image ready" />
                  ) : null}
                  {competitionForm.imageUrl ? (
                    <Button
                      color="inherit"
                      disabled={competitionImageUploading}
                      onClick={() => {
                        setCompetitionForm((prev) => ({ ...prev, imageUrl: '' }));
                        setCompetitionImageUploadProgress(0);
                        setCompetitionImageError(null);
                      }}
                    >
                      Remove image
                    </Button>
                  ) : null}
                </Stack>
                {competitionImageUploading ? (
                  <LinearProgress
                    variant={competitionImageUploadProgress > 0 ? 'determinate' : 'indeterminate'}
                    value={competitionImageUploadProgress > 0 ? competitionImageUploadProgress : undefined}
                    sx={{ maxWidth: 320 }}
                  />
                ) : null}
                {competitionImageError ? <FormHelperText error>{competitionImageError}</FormHelperText> : null}
                <TextField
                  label="Image URL (optional)"
                  value={competitionForm.imageUrl}
                  onChange={(event) => setCompetitionForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
                  placeholder="Paste an image link or upload above"
                />
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseCreateCompetition} disabled={creatingCompetition || competitionImageUploading}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={creatingCompetition || competitionImageUploading}>
              {creatingCompetition ? 'Creating…' : 'Create competition'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={createUserOpen}
        onClose={handleCloseCreateUser}
        fullWidth
        maxWidth="sm"
        aria-labelledby="create-user-dialog"
      >
        <Box component="form" onSubmit={handleCreateUser}>
          <DialogTitle id="create-user-dialog">Invite user</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <TextField
                label="Name"
                value={userForm.name}
                onChange={(event) => setUserForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
              <TextField
                label="Email"
                type="email"
                value={userForm.email}
                onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
                required
              />
              <TextField
                label="Temporary password"
                type="password"
                value={userForm.password}
                onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))}
                required
              />
              <Select
                value={userForm.role}
                onChange={(event) => setUserForm((prev) => ({ ...prev, role: event.target.value as 'student' | 'admin' }))}
              >
                <MenuItem value="student">Student</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </Select>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseCreateUser} disabled={creatingUser}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={creatingUser}>
              {creatingUser ? 'Inviting…' : 'Create user'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={eventDialogOpen}
        onClose={() => {
          setEventDialogOpen(false);
          setEventDialogImageError(null);
          setEventDialogImageProgress(0);
          setEventDialogImageUploading(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Edit event</DialogTitle>
        {eventDialogForm ? (
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Title"
                value={eventDialogForm.title}
                onChange={(event) =>
                  setEventDialogForm((prev) => (prev ? { ...prev, title: event.target.value } : prev))
                }
                required
              />
              <TextField
                label="Sub-header"
                value={eventDialogForm.subHeader}
                onChange={(event) =>
                  setEventDialogForm((prev) => (prev ? { ...prev, subHeader: event.target.value } : prev))
                }
              />
              <TextField
                label="Body"
                multiline
                minRows={4}
                value={eventDialogForm.body}
                onChange={(event) =>
                  setEventDialogForm((prev) => (prev ? { ...prev, body: event.target.value } : prev))
                }
              />
              <Autocomplete
                multiple
                freeSolo
                options={EVENT_TAG_OPTIONS}
                filterSelectedOptions
                value={eventDialogForm.tags}
                onChange={(_event, value) =>
                  setEventDialogForm((prev) => {
                    if (!prev) {
                      return prev;
                    }
                    const cleaned = value.map((tag) => tag.trim()).filter((tag) => Boolean(tag));
                    const unique = Array.from(
                      new Map(cleaned.map((tag) => [tag.toLowerCase(), tag])).values(),
                    ).slice(0, MAX_EVENT_TAGS);
                    return { ...prev, tags: unique };
                  })
                }
                renderTags={(tagValue, getTagProps) =>
                  tagValue.map((option, index) => (
                    <Chip {...getTagProps({ index })} label={option} size="small" />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Tags"
                    placeholder="Add categories such as Career or Community"
                    helperText={`Select up to ${MAX_EVENT_TAGS} tags.`}
                  />
                )}
              />
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                  <Button variant="outlined" component="label" disabled={eventDialogImageUploading}>
                    {eventDialogForm.url ? 'Replace image' : 'Upload image'}
                    <input type="file" accept="image/*" hidden onChange={handleEventDialogImageSelect} />
                  </Button>
                  {eventDialogImageUploading ? (
                    <Chip color="primary" variant="outlined" label="Uploading…" />
                  ) : eventDialogForm.url ? (
                    <Chip color="success" label="Image ready" />
                  ) : null}
                  {eventDialogForm.url ? (
                    <Button
                      color="inherit"
                      disabled={eventDialogImageUploading}
                      onClick={() => {
                        setEventDialogForm((prev) => (prev ? { ...prev, url: '' } : prev));
                        setEventDialogImageProgress(0);
                        setEventDialogImageError(null);
                      }}
                    >
                      Remove image
                    </Button>
                  ) : null}
                </Stack>
                {eventDialogImageUploading ? (
                  <LinearProgress
                    variant={eventDialogImageProgress > 0 ? 'determinate' : 'indeterminate'}
                    value={eventDialogImageProgress > 0 ? eventDialogImageProgress : undefined}
                    sx={{ maxWidth: 320 }}
                  />
                ) : null}
                {eventDialogImageError ? <FormHelperText error>{eventDialogImageError}</FormHelperText> : null}
                <TextField
                  label="Image URL (optional)"
                  value={eventDialogForm.url ?? ''}
                  onChange={(event) =>
                    setEventDialogForm((prev) => (prev ? { ...prev, url: event.target.value } : prev))
                  }
                />
              </Stack>
              <Stack spacing={1.5}>
                <Stack spacing={0.5}>
                  <Typography variant="subtitle1">Event links</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Update the resources or registration links associated with this event.
                  </Typography>
                </Stack>
                <Stack spacing={1.5}>
                  {eventDialogForm.links.map((link, index) => (
                    <Stack
                      key={`${eventDialogForm.id}-link-${index}`}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1.5}
                      alignItems={{ sm: 'center' }}
                    >
                      <TextField
                        label="Link label"
                        value={link.label}
                        onChange={(event) => handleEventDialogLinkChange(index, 'label', event.target.value)}
                        placeholder="e.g. Register here"
                        fullWidth
                      />
                      <TextField
                        label="Link URL"
                        type="url"
                        value={link.url}
                        onChange={(event) => handleEventDialogLinkChange(index, 'url', event.target.value)}
                        placeholder="https://example.com"
                        fullWidth
                      />
                      <IconButton
                        aria-label="Remove link"
                        onClick={() => handleRemoveEventDialogLink(index)}
                        color="inherit"
                      >
                        <RemoveCircleOutlineIcon />
                      </IconButton>
                    </Stack>
                  ))}
                </Stack>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddCircleOutlineIcon />}
                  onClick={handleAddEventDialogLink}
                >
                  Add link
                </Button>
              </Stack>
              <FormControlLabel
                control={
                  <Switch
                    checked={eventDialogForm.hasRsvp}
                    onChange={(_, checked) =>
                      setEventDialogForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              hasRsvp: checked,
                              rsvpRewardPoints: checked ? prev.rsvpRewardPoints : 0,
                            }
                          : prev,
                      )
                    }
                  />
                }
                label="Enable RSVP collection"
              />
              {eventDialogForm.hasRsvp ? (
                <Stack spacing={1}>
                  <TextField
                    label="Reward points for attendees"
                    type="number"
                    inputProps={{ min: 0 }}
                    value={eventDialogForm.rsvpRewardPoints}
                    onChange={(event) =>
                      setEventDialogForm((prev) =>
                        prev ? { ...prev, rsvpRewardPoints: Number(event.target.value) } : prev,
                      )
                    }
                  />
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={2}
                    alignItems="flex-start"
                  >
                    <Stack spacing={0.5}>
                      <Typography variant="body2" color="text.secondary">
                        RSVP key: <code>{eventDialogForm.rsvpKey ?? 'Generating…'}</code>
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {eventDialogForm.rsvpAttendees.length} RSVP
                        {eventDialogForm.rsvpAttendees.length === 1 ? '' : 's'} collected.
                      </Typography>
                    </Stack>
                    <RsvpQrCodePreview
                      imageUrl={eventDialogForm.rsvpQrCodeUrl}
                      size={128}
                      downloadName={`event-${eventDialogForm.id}-rsvp.png`}
                    />
                  </Stack>
                </Stack>
              ) : null}
            </Stack>
          </DialogContent>
        ) : null}
        <DialogActions>
          <Button
            onClick={() => {
              setEventDialogOpen(false);
              setEventDialogImageError(null);
              setEventDialogImageProgress(0);
              setEventDialogImageUploading(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleUpdateEvent()} variant="contained" disabled={eventDialogImageUploading}>
            Save changes
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={itemDialogOpen}
        onClose={() => {
          setItemDialogOpen(false);
          setItemDialogImageError(null);
          setItemDialogImageProgress(0);
          setItemDialogImageUploading(false);
        }}
        fullWidth
        maxWidth="sm"
      >
      <DialogTitle>Edit product</DialogTitle>
        {itemDialogForm ? (
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Name"
                value={itemDialogForm.name}
                onChange={(event) =>
                  setItemDialogForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                }
                required
              />
              <TextField
                label="Description"
                multiline
                minRows={3}
                value={itemDialogForm.description}
                onChange={(event) =>
                  setItemDialogForm((prev) => (prev ? { ...prev, description: event.target.value } : prev))
                }
              />
              <TextField
                label="Stock"
                type="number"
                value={itemDialogForm.availabilityCount}
                onChange={(event) =>
                  setItemDialogForm((prev) =>
                    prev ? { ...prev, availabilityCount: Number(event.target.value) } : prev,
                  )
                }
              />
              <TextField
                label="Price (in cents)"
                type="number"
                value={itemDialogForm.price}
                onChange={(event) =>
                  setItemDialogForm((prev) => (prev ? { ...prev, price: Number(event.target.value) } : prev))
                }
              />
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                  <Button variant="outlined" component="label" disabled={itemDialogImageUploading}>
                    {itemDialogForm.url ? 'Replace image' : 'Upload image'}
                    <input type="file" accept="image/*" hidden onChange={handleItemDialogImageSelect} />
                  </Button>
                  {itemDialogImageUploading ? (
                    <Chip color="primary" variant="outlined" label="Uploading…" />
                  ) : itemDialogForm.url ? (
                    <Chip color="success" label="Image ready" />
                  ) : null}
                  {itemDialogForm.url ? (
                    <Button
                      color="inherit"
                      disabled={itemDialogImageUploading}
                      onClick={() => {
                        setItemDialogForm((prev) => (prev ? { ...prev, url: '' } : prev));
                        setItemDialogImageProgress(0);
                        setItemDialogImageError(null);
                      }}
                    >
                      Remove image
                    </Button>
                  ) : null}
                </Stack>
                {itemDialogImageUploading ? (
                  <LinearProgress
                    variant={itemDialogImageProgress > 0 ? 'determinate' : 'indeterminate'}
                    value={itemDialogImageProgress > 0 ? itemDialogImageProgress : undefined}
                    sx={{ maxWidth: 320 }}
                  />
                ) : null}
                {itemDialogImageError ? <FormHelperText error>{itemDialogImageError}</FormHelperText> : null}
                <TextField
                  label="Image URL (optional)"
                  value={itemDialogForm.url ?? ''}
                  onChange={(event) =>
                    setItemDialogForm((prev) => (prev ? { ...prev, url: event.target.value } : prev))
                  }
                />
              </Stack>
            </Stack>
          </DialogContent>
        ) : null}
      <DialogActions>
        <Button
          onClick={() => {
            setItemDialogOpen(false);
            setItemDialogImageError(null);
            setItemDialogImageProgress(0);
            setItemDialogImageUploading(false);
          }}
        >
          Cancel
        </Button>
        <Button onClick={() => void handleUpdateItem()} variant="contained" disabled={itemDialogImageUploading}>
          Save changes
        </Button>
      </DialogActions>
    </Dialog>

      <Dialog
        open={rewardDialogOpen}
        onClose={() => {
          setRewardDialogOpen(false);
          setRewardDialogForm(null);
          setRewardDialogImageError(null);
          setRewardDialogImageProgress(0);
          setRewardDialogImageUploading(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Edit reward</DialogTitle>
        {rewardDialogForm ? (
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Name"
                value={rewardDialogForm.name}
                onChange={(event) =>
                  setRewardDialogForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                }
                required
              />
              <TextField
                label="Description"
                multiline
                minRows={3}
                value={rewardDialogForm.description}
                onChange={(event) =>
                  setRewardDialogForm((prev) => (prev ? { ...prev, description: event.target.value } : prev))
                }
              />
              <TextField
                label="Points cost"
                type="number"
                value={rewardDialogForm.pointsCost}
                onChange={(event) =>
                  setRewardDialogForm((prev) =>
                    prev ? { ...prev, pointsCost: Math.max(0, Number(event.target.value)) } : prev,
                  )
                }
                inputProps={{ min: 0 }}
                required
              />
              <TextField
                label="Stock available"
                type="number"
                value={rewardDialogForm.stock}
                onChange={(event) =>
                  setRewardDialogForm((prev) =>
                    prev ? { ...prev, stock: Math.max(0, Number(event.target.value)) } : prev,
                  )
                }
                inputProps={{ min: 0 }}
                required
              />
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                  <Button variant="outlined" component="label" disabled={rewardDialogImageUploading}>
                    {rewardDialogForm.imageUrl ? 'Replace image' : 'Upload image'}
                    <input type="file" accept="image/*" hidden onChange={handleRewardDialogImageSelect} />
                  </Button>
                  {rewardDialogImageUploading ? (
                    <Chip color="primary" variant="outlined" label="Uploading…" />
                  ) : rewardDialogForm.imageUrl ? (
                    <Chip color="success" label="Image ready" />
                  ) : null}
                  {rewardDialogForm.imageUrl ? (
                    <Button
                      color="inherit"
                      disabled={rewardDialogImageUploading}
                      onClick={() => {
                        setRewardDialogForm((prev) => (prev ? { ...prev, imageUrl: '' } : prev));
                        setRewardDialogImageProgress(0);
                        setRewardDialogImageError(null);
                      }}
                    >
                      Remove image
                    </Button>
                  ) : null}
                </Stack>
                {rewardDialogImageUploading ? (
                  <LinearProgress
                    variant={rewardDialogImageProgress > 0 ? 'determinate' : 'indeterminate'}
                    value={rewardDialogImageProgress > 0 ? rewardDialogImageProgress : undefined}
                    sx={{ maxWidth: 320 }}
                  />
                ) : null}
                {rewardDialogImageError ? <FormHelperText error>{rewardDialogImageError}</FormHelperText> : null}
                <TextField
                  label="Image URL (optional)"
                  value={rewardDialogForm.imageUrl ?? ''}
                  onChange={(event) =>
                    setRewardDialogForm((prev) => (prev ? { ...prev, imageUrl: event.target.value } : prev))
                  }
                />
              </Stack>
            </Stack>
          </DialogContent>
        ) : null}
        <DialogActions>
          <Button
            onClick={() => {
              setRewardDialogOpen(false);
              setRewardDialogForm(null);
              setRewardDialogImageError(null);
              setRewardDialogImageProgress(0);
              setRewardDialogImageUploading(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleUpdateReward()} variant="contained" disabled={rewardDialogImageUploading}>
            Save changes
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={pollDialogOpen}
        onClose={() => {
          setPollDialogOpen(false);
          setPollDialogForm(null);
          setPollDialogOptions([]);
          setPollDialogImageError(null);
          setPollDialogImageProgress(0);
          setPollDialogImageUploading(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Edit poll</DialogTitle>
        {pollDialogForm ? (
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Question"
                value={pollDialogForm.question}
                onChange={(event) =>
                  setPollDialogForm((prev) => (prev ? { ...prev, question: event.target.value } : prev))
                }
                required
              />
              <Stack spacing={1.5}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle2" fontWeight={600}>
                    Options
                  </Typography>
                  <IconButton
                    aria-label="Add option"
                    color="primary"
                    onClick={handleAddDialogPollOption}
                    size="small"
                    disabled={pollDialogForm.isFinalized}
                  >
                    <AddCircleOutlineIcon />
                  </IconButton>
                </Stack>
                <Stack spacing={1}>
                  {pollDialogOptions.map((option, index) => (
                    <Stack key={`${pollDialogForm.id}-option-${index}`} direction="row" spacing={1} alignItems="center">
                      <TextField
                        fullWidth
                        label={`Option ${index + 1}`}
                        value={option}
                        onChange={(event) => handleDialogPollOptionChange(index, event.target.value)}
                        required={index < 2}
                        disabled={pollDialogForm.isFinalized}
                      />
                      {pollDialogOptions.length > 2 ? (
                        <IconButton
                          aria-label={`Remove option ${index + 1}`}
                          color="inherit"
                          onClick={() => handleRemoveDialogPollOption(index)}
                          size="small"
                          disabled={pollDialogForm.isFinalized}
                        >
                          <RemoveCircleOutlineIcon />
                        </IconButton>
                      ) : null}
                    </Stack>
                  ))}
                </Stack>
              </Stack>
              <TextField
                label="Reward points per participant"
                type="number"
                inputProps={{ min: 0 }}
                value={pollDialogForm.rewardPoints}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setPollDialogForm((prev) =>
                    prev
                      ? {
                          ...prev,
                          rewardPoints: Number.isNaN(value) ? 0 : Math.max(0, Math.floor(value)),
                        }
                      : prev,
                  );
                }}
                disabled={pollDialogForm.isFinalized}
                helperText="Students earn these points after the poll is finalised."
              />
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                  <Button variant="outlined" component="label" disabled={pollDialogImageUploading}>
                    {pollDialogForm.imageUrl ? 'Replace image' : 'Upload image'}
                    <input type="file" accept="image/*" hidden onChange={handlePollDialogImageSelect} />
                  </Button>
                  {pollDialogImageUploading ? (
                    <Chip color="primary" variant="outlined" label="Uploading…" />
                  ) : pollDialogForm.imageUrl ? (
                    <Chip color="success" label="Image ready" />
                  ) : null}
                  {pollDialogForm.imageUrl ? (
                    <Button
                      color="inherit"
                      disabled={pollDialogImageUploading}
                      onClick={() => {
                        setPollDialogForm((prev) => (prev ? { ...prev, imageUrl: '' } : prev));
                        setPollDialogImageProgress(0);
                        setPollDialogImageError(null);
                      }}
                    >
                      Remove image
                    </Button>
                  ) : null}
                </Stack>
                {pollDialogImageUploading ? (
                  <LinearProgress
                    variant={pollDialogImageProgress > 0 ? 'determinate' : 'indeterminate'}
                    value={pollDialogImageProgress > 0 ? pollDialogImageProgress : undefined}
                    sx={{ maxWidth: 320 }}
                  />
                ) : null}
                {pollDialogImageError ? <FormHelperText error>{pollDialogImageError}</FormHelperText> : null}
                <TextField
                  label="Image URL (optional)"
                  value={pollDialogForm.imageUrl ?? ''}
                  onChange={(event) =>
                    setPollDialogForm((prev) => (prev ? { ...prev, imageUrl: event.target.value } : prev))
                  }
                />
              </Stack>
            </Stack>
          </DialogContent>
        ) : null}
        <DialogActions>
          <Button
            onClick={() => {
              setPollDialogOpen(false);
              setPollDialogForm(null);
              setPollDialogOptions([]);
              setPollDialogImageError(null);
              setPollDialogImageProgress(0);
              setPollDialogImageUploading(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleUpdatePoll()} variant="contained" disabled={pollDialogImageUploading}>
            Save changes
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={competitionDialogOpen}
        onClose={() => {
          setCompetitionDialogOpen(false);
          setCompetitionDialogForm(null);
          setCompetitionDialogImageError(null);
          setCompetitionDialogImageProgress(0);
          setCompetitionDialogImageUploading(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Edit competition</DialogTitle>
        {competitionDialogForm ? (
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Title"
                value={competitionDialogForm.title}
                onChange={(event) =>
                  setCompetitionDialogForm((prev) => (prev ? { ...prev, title: event.target.value } : prev))
                }
                required
              />
              <TextField
                label="Summary"
                value={competitionDialogForm.summary}
                onChange={(event) =>
                  setCompetitionDialogForm((prev) => (prev ? { ...prev, summary: event.target.value } : prev))
                }
                required
              />
              <TextField
                label="Details"
                multiline
                minRows={4}
                value={competitionDialogForm.details}
                onChange={(event) =>
                  setCompetitionDialogForm((prev) => (prev ? { ...prev, details: event.target.value } : prev))
                }
                required
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={competitionDialogForm.isActive}
                    onChange={(event) =>
                      setCompetitionDialogForm((prev) =>
                        prev ? { ...prev, isActive: event.target.checked } : prev,
                      )
                    }
                  />
                }
                label="Accepting submissions"
              />
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                  <Button variant="outlined" component="label" disabled={competitionDialogImageUploading}>
                    {competitionDialogForm.imageUrl ? 'Replace image' : 'Upload image'}
                    <input type="file" accept="image/*" hidden onChange={handleCompetitionDialogImageSelect} />
                  </Button>
                  {competitionDialogImageUploading ? (
                    <Chip color="primary" variant="outlined" label="Uploading…" />
                  ) : competitionDialogForm.imageUrl ? (
                    <Chip color="success" label="Image ready" />
                  ) : null}
                  {competitionDialogForm.imageUrl ? (
                    <Button
                      color="inherit"
                      disabled={competitionDialogImageUploading}
                      onClick={() => {
                        setCompetitionDialogForm((prev) => (prev ? { ...prev, imageUrl: '' } : prev));
                        setCompetitionDialogImageProgress(0);
                        setCompetitionDialogImageError(null);
                      }}
                    >
                      Remove image
                    </Button>
                  ) : null}
                </Stack>
                {competitionDialogImageUploading ? (
                  <LinearProgress
                    variant={competitionDialogImageProgress > 0 ? 'determinate' : 'indeterminate'}
                    value={
                      competitionDialogImageProgress > 0 ? competitionDialogImageProgress : undefined
                    }
                    sx={{ maxWidth: 320 }}
                  />
                ) : null}
                {competitionDialogImageError ? (
                  <FormHelperText error>{competitionDialogImageError}</FormHelperText>
                ) : null}
                <TextField
                  label="Image URL (optional)"
                  value={competitionDialogForm.imageUrl ?? ''}
                  onChange={(event) =>
                    setCompetitionDialogForm((prev) => (prev ? { ...prev, imageUrl: event.target.value } : prev))
                  }
                />
              </Stack>
            </Stack>
          </DialogContent>
        ) : null}
        <DialogActions>
          <Button
            onClick={() => {
              setCompetitionDialogOpen(false);
              setCompetitionDialogForm(null);
              setCompetitionDialogImageError(null);
              setCompetitionDialogImageProgress(0);
              setCompetitionDialogImageUploading(false);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleUpdateCompetition()}
            variant="contained"
            disabled={competitionDialogImageUploading}
          >
            Save changes
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={submissionDialogOpen}
        onClose={handleCloseSubmissionDialog}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {submissionDialogCompetition ? `Submissions — ${submissionDialogCompetition.title}` : 'Submissions'}
        </DialogTitle>
        <DialogContent dividers>
          {submissionDialogLoading ? (
            <Typography variant="body2" color="text.secondary">
              Loading submissions…
            </Typography>
          ) : submissionDialogRecords.length === 0 ? (
            <Alert severity="info">No submissions yet.</Alert>
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              {submissionDialogRecords.map((submission) => (
                <Card key={submission.id} variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Typography variant="body1">{submission.content}</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip
                          label={`Submitted ${formatDateTime(submission.submittedAt)}`}
                          variant="outlined"
                        />
                        {submission.updatedAt ? (
                          <Chip label={`Updated ${formatDateTime(submission.updatedAt)}`} variant="outlined" />
                        ) : null}
                        {submission.participantId ? (
                          <Chip label={`Participant ${submission.participantId}`} variant="outlined" />
                        ) : null}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseSubmissionDialog}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={userDialogOpen} onClose={() => setUserDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Edit user</DialogTitle>
        {userDialogForm ? (
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Name"
                value={userDialogForm.name}
                onChange={(event) =>
                  setUserDialogForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                }
              />
              <Select
                value={userDialogForm.role}
                onChange={(event) =>
                  setUserDialogForm((prev) =>
                    prev ? { ...prev, role: event.target.value as 'student' | 'admin' } : prev,
                  )
                }
              >
                <MenuItem value="student">Student</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </Select>
              <TextField
                label="Reward points"
                type="number"
                inputProps={{ min: 0 }}
                value={userDialogForm.rewardPoints}
                onChange={(event) =>
                  setUserDialogForm((prev) =>
                    prev ? { ...prev, rewardPoints: Number(event.target.value) } : prev,
                  )
                }
              />
            </Stack>
          </DialogContent>
        ) : null}
        <DialogActions>
          <Button onClick={() => setUserDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => void handleUpdateUser()} variant="contained">
            Save changes
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={postDialogOpen} onClose={() => setPostDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Edit community post</DialogTitle>
        {postDialogForm ? (
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Title"
                value={postDialogForm.title}
                onChange={(event) =>
                  setPostDialogForm((prev) => (prev ? { ...prev, title: event.target.value } : prev))
                }
                required
              />
              <TextField
                label="Content"
                multiline
                minRows={4}
                value={postDialogForm.content}
                onChange={(event) =>
                  setPostDialogForm((prev) => (prev ? { ...prev, content: event.target.value } : prev))
                }
              />
              <TextField
                label="Flair"
                value={postDialogForm.flair ?? ''}
                onChange={(event) =>
                  setPostDialogForm((prev) => (prev ? { ...prev, flair: event.target.value || null } : prev))
                }
              />
              <TextField
                label="Image URL"
                value={postDialogForm.imageUrl ?? ''}
                onChange={(event) =>
                  setPostDialogForm((prev) => (prev ? { ...prev, imageUrl: event.target.value || null } : prev))
                }
              />
            </Stack>
          </DialogContent>
        ) : null}
        <DialogActions>
          <Button onClick={() => setPostDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => void handleUpdatePost()} variant="contained">
            Save changes
          </Button>
        </DialogActions>
      </Dialog>
      </Box>
    </>
  );
}

export default AdminDashboardPage;
