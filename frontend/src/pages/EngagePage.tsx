import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CardMedia,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  LinearProgress,
  Pagination,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PageHero from '../components/PageHero';
import { useAuth } from '../context/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { Helmet } from 'react-helmet-async';

const API = import.meta.env.VITE_BACKEND_API;

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
  userVote?: number | null;
};

type PollRecord = {
  id: string;
  question: string;
  options: string[];
  imageUrl: string | null;
  isFinalized: boolean;
  rewardPoints: number;
  rewardPointsAwarded: boolean;
  totalVotes: number;
  results: PollOptionResult[] | null;
  userVote: number | null;
};

type CompetitionSubmissionApi = {
  id: string;
  content: string;
  submittedAt: string;
  updatedAt?: string | null;
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
  userSubmission?: CompetitionSubmissionApi | null;
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
  userSubmission: CompetitionSubmissionApi | null;
};

type CompetitionSubmissionResponse = {
  id: string;
  content: string;
  submittedAt: string;
  updatedAt?: string | null;
};

// Shapes poll responses into a structure suited for rendering.
const mapPoll = (api: PollApi): PollRecord => ({
  id: api.id,
  question: api.question,
  options: api.options,
  imageUrl: api.imageUrl ?? null,
  isFinalized: api.isFinalized,
  rewardPoints: api.rewardPoints,
  rewardPointsAwarded: api.rewardPointsAwarded,
  totalVotes: api.totalVotes,
  results: api.results ?? null,
  userVote: api.userVote ?? null,
});

// Shapes competition responses into a structure suited for rendering.
const mapCompetition = (api: CompetitionApi): CompetitionRecord => ({
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
});

// Provides interactive polls and competition submissions for students.
const EngagePage = () => {
  const { user } = useAuth();
  const [polls, setPolls] = useState<PollRecord[]>([]);
  const [pollsLoading, setPollsLoading] = useState(true);
  const [pollsError, setPollsError] = useState<string | null>(null);
  const [votingPollId, setVotingPollId] = useState<string | null>(null);

  const [competitions, setCompetitions] = useState<CompetitionRecord[]>([]);
  const [competitionsLoading, setCompetitionsLoading] = useState(true);
  const [competitionsError, setCompetitionsError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'polls' | 'competitions'>('polls');
  const [pollSearch, setPollSearch] = useState('');
  const [competitionSearch, setCompetitionSearch] = useState('');
  const [pollPage, setPollPage] = useState(1);
  const [competitionPage, setCompetitionPage] = useState(1);

  const [submissionDialogOpen, setSubmissionDialogOpen] = useState(false);
  const [submissionCompetition, setSubmissionCompetition] = useState<CompetitionRecord | null>(null);
  const [submissionContent, setSubmissionContent] = useState('');
  const [submissionSaving, setSubmissionSaving] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  const POLL_PAGE_SIZE = 6;
  const COMPETITION_PAGE_SIZE = 6;

  const filteredPolls = useMemo(() => {
    const query = pollSearch.trim().toLowerCase();
    if (!query) {
      return polls;
    }
    return polls.filter((poll) => poll.question.toLowerCase().includes(query));
  }, [polls, pollSearch]);

  const pollPageCount = Math.max(1, Math.ceil(filteredPolls.length / POLL_PAGE_SIZE));
  const paginatedPolls = useMemo(
    () =>
      filteredPolls.slice(
        (pollPage - 1) * POLL_PAGE_SIZE,
        (pollPage - 1) * POLL_PAGE_SIZE + POLL_PAGE_SIZE,
      ),
    [filteredPolls, pollPage],
  );

  const sortedCompetitions = useMemo(
    () => [...competitions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [competitions],
  );

  const filteredCompetitions = useMemo(() => {
    const query = competitionSearch.trim().toLowerCase();
    if (!query) {
      return sortedCompetitions;
    }
    return sortedCompetitions.filter((competition) => competition.title.toLowerCase().includes(query));
  }, [sortedCompetitions, competitionSearch]);

  const competitionPageCount = Math.max(1, Math.ceil(filteredCompetitions.length / COMPETITION_PAGE_SIZE));
  const paginatedCompetitions = useMemo(
    () =>
      filteredCompetitions.slice(
        (competitionPage - 1) * COMPETITION_PAGE_SIZE,
        (competitionPage - 1) * COMPETITION_PAGE_SIZE + COMPETITION_PAGE_SIZE,
      ),
    [filteredCompetitions, competitionPage],
  );

  useEffect(() => {
    if (!user) {
      return;
    }

    const pollsUrl = `${API}/api/polls?participantId=${encodeURIComponent(user.id)}`;
    const competitionsUrl = `${API}/api/competitions?participantId=${encodeURIComponent(user.id)}`;

    const fetchPolls = async () => {
      try {
        const { data } = await axios.get<PollApi[]>(pollsUrl);
        setPolls(data.map(mapPoll));
      } catch (error) {
        console.error('Failed to load polls', error);
        setPollsError('We could not load polls at this time.');
      } finally {
        setPollsLoading(false);
      }
    };

    const fetchCompetitions = async () => {
      try {
        const { data } = await axios.get<CompetitionApi[]>(competitionsUrl);
        setCompetitions(data.map(mapCompetition));
      } catch (error) {
        console.error('Failed to load competitions', error);
        setCompetitionsError('We could not load competitions right now.');
      } finally {
        setCompetitionsLoading(false);
      }
    };

    void fetchPolls();
    void fetchCompetitions();
  }, [user]);

  useEffect(() => {
    setPollPage(1);
  }, [pollSearch, polls]);

  useEffect(() => {
    setCompetitionPage(1);
  }, [competitionSearch, sortedCompetitions]);

  useEffect(() => {
    setPollPage((prev) => Math.min(prev, pollPageCount));
  }, [pollPageCount]);

  useEffect(() => {
    setCompetitionPage((prev) => Math.min(prev, competitionPageCount));
  }, [competitionPageCount]);

  // Records the student's vote for a poll option.
  async function handleVote(pollId: string, optionIndex: number) {
    if (!user) {
      return;
    }
    if (!isOnline) {
      alert('You are offline. Reconnect to vote.');
      return;
    }
    try {
      setVotingPollId(pollId);
      const { data } = await axios.post<PollApi>(`${API}/api/polls/${pollId}/vote`, {
        participantId: user.id,
        optionIndex,
      });
      const updated = mapPoll(data);
      setPolls((prev) => prev.map((poll) => (poll.id === pollId ? updated : poll)));
    } catch (error) {
      console.error('Failed to submit vote', error);
      alert('Unable to submit your vote. Please try again.');
    } finally {
      setVotingPollId(null);
    }
  }

  // Opens the submission dialog prefilled with any existing entry.
  function openSubmissionDialog(competition: CompetitionRecord) {
    setSubmissionCompetition(competition);
    setSubmissionContent(competition.userSubmission?.content ?? '');
    setSubmissionError(null);
    setSubmissionDialogOpen(true);
  }

  // Resets and closes the submission dialog.
  function closeSubmissionDialog() {
    setSubmissionDialogOpen(false);
    setSubmissionCompetition(null);
    setSubmissionContent('');
    setSubmissionError(null);
    setSubmissionSaving(false);
  }

  // Sends the student's competition submission to the backend.
  async function handleSubmitCompetition() {
    if (!user || !submissionCompetition) {
      return;
    }
    const content = submissionContent.trim();
    if (!content) {
      setSubmissionError('Please enter your submission before sending.');
      return;
    }
    if (!isOnline) {
      setSubmissionError('You are offline. Reconnect to submit your entry.');
      return;
    }
    try {
      setSubmissionSaving(true);
      const { data } = await axios.post<CompetitionSubmissionResponse>(
        `${API}/api/competitions/${submissionCompetition.id}/submit`,
        {
          participantId: user.id,
          content,
        },
      );
      setCompetitions((prev) =>
        prev.map((competition) =>
          competition.id === submissionCompetition.id
            ? {
                ...competition,
                userSubmission: {
                  id: data.id,
                  content: data.content,
                  submittedAt: data.submittedAt,
                  updatedAt: data.updatedAt,
                },
                submissionCount: competition.userSubmission
                  ? competition.submissionCount
                  : competition.submissionCount + 1,
              }
            : competition,
        ),
      );
      closeSubmissionDialog();
      alert('Your submission has been saved.');
    } catch (error) {
      console.error('Failed to submit competition entry', error);
      setSubmissionError('Unable to submit your entry. Please try again.');
    } finally {
      setSubmissionSaving(false);
    }
  }

  return (
    <>
      <Helmet>
        <title>MUSEngage | Polls and competitions</title>
        <meta
          name="description"
          content="Vote in live polls and submit entries to competitions to shape the Murdoch University experience."
        />
      </Helmet>
      <Box>
        <PageHero
        eyebrow="Murdoch University"
        title="Polls & Competitions"
        description="Have your say in campus decisions and submit entries for upcoming competitions."
        theme="dashboard"
      />

      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 8 } }}>
        <Stack spacing={4}>
          <Tabs
            value={activeTab}
            onChange={(_event, value: 'polls' | 'competitions') => setActiveTab(value)}
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label="Polls" value="polls" />
            <Tab label="Competitions" value="competitions" />
          </Tabs>

          {activeTab === 'polls' ? (
            <Stack spacing={2}>
              <Typography variant="h4" component="h2">Live polls</Typography>
              <Typography variant="body1" color="text.secondary">
                Vote on the topics that matter to you. Poll results are revealed once voting closes.
              </Typography>

              <TextField
                label="Search polls"
                placeholder="Search by question"
                value={pollSearch}
                onChange={(event) => setPollSearch(event.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />

              {pollsLoading ? (
                <Typography variant="body1" color="text.secondary">
                  Loading polls…
                </Typography>
              ) : pollsError ? (
                <Alert severity="error">{pollsError}</Alert>
              ) : filteredPolls.length === 0 ? (
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
                          <Chip
                            label={poll.isFinalized ? 'Closed' : 'Poll is Open'}
                            color={poll.isFinalized ? 'success' : 'warning'}
                          />
                        </Stack>
                      }
                    />
                    <CardContent>
                      {poll.imageUrl ? (
                        <CardMedia
                          component="img"
                          image={poll.imageUrl}
                          srcSet={`${poll.imageUrl} 1x, ${poll.imageUrl} 2x`}
                          sizes="(max-width: 600px) 100vw, 520px"
                          alt={poll.question}
                          loading="lazy"
                          decoding="async"
                          width={520}
                          height={320}
                          sx={{ mb: 2, borderRadius: 1.5, width: '100%', objectFit: 'cover' }}
                        />
                      ) : null}
                      {poll.isFinalized && poll.results ? (
                        <Stack spacing={2}>
                          {poll.rewardPoints > 0 ? (
                            <Typography variant="body2" color="text.secondary">
                              {poll.rewardPointsAwarded
                                ? `Participants earned ${poll.rewardPoints} reward point${
                                    poll.rewardPoints === 1 ? '' : 's'
                                  } for this poll.`
                                : `This poll awards ${poll.rewardPoints} reward point${
                                    poll.rewardPoints === 1 ? '' : 's'
                                  } to everyone who participated.`}
                            </Typography>
                          ) : null}
                          {poll.results.map((result) => {
                            const percent = poll.totalVotes
                              ? Math.round((result.votes / poll.totalVotes) * 100)
                              : 0;
                            return (
                              <Box key={`${poll.id}-${result.option}`}>
                                <Typography variant="subtitle2">{result.option}</Typography>
                                <LinearProgress
                                  variant="determinate"
                                  value={poll.totalVotes ? (result.votes / poll.totalVotes) * 100 : 0}
                                  sx={{ mt: 1, mb: 0.5 }}
                                  aria-label={`Votes for ${result.option}`}
                                />
                                <Typography variant="caption" color="text.secondary">
                                  {result.votes} vote{result.votes === 1 ? '' : 's'} ({percent}%)
                                </Typography>
                              </Box>
                            );
                          })}
                          {poll.rewardPoints > 0 && poll.userVote !== null ? (
                            <Typography variant="caption" color="text.secondary">
                              You earned {poll.rewardPoints} reward point
                              {poll.rewardPoints === 1 ? '' : 's'} for voting in this poll.
                            </Typography>
                          ) : null}
                        </Stack>
                      ) : (
                        <Stack spacing={1.5}>
                          {poll.rewardPoints > 0 ? (
                            <Typography variant="body2" color="text.secondary">
                              Vote now to earn {poll.rewardPoints} reward point
                              {poll.rewardPoints === 1 ? '' : 's'} when the poll closes.
                            </Typography>
                          ) : null}
                          {poll.options.map((option, index) => {
                            const isSelected = poll.userVote === index;
                            return (
                              <Button
                                key={`${poll.id}-${option}`}
                                variant={isSelected ? 'contained' : 'outlined'}
                                color={isSelected ? 'primary' : 'inherit'}
                                disabled={poll.isFinalized || votingPollId === poll.id || !isOnline}
                                onClick={() => void handleVote(poll.id, index)}
                              >
                                {option}
                              </Button>
                            );
                          })}
                          {poll.userVote !== null ? (
                            <Typography variant="caption" color="text.secondary">
                              You voted for “{poll.options[poll.userVote]}”. You can change your vote until the poll closes.
                              {poll.rewardPoints > 0
                                ? ` You will receive ${poll.rewardPoints} reward point${
                                    poll.rewardPoints === 1 ? '' : 's'
                                  } when the poll is finalised.`
                                : ''}
                            </Typography>
                          ) : null}
                        </Stack>
                      )}
                    </CardContent>
                  </Card>
                  ))}
                  {pollPageCount > 1 ? (
                    <Pagination
                      count={pollPageCount}
                      page={pollPage}
                      onChange={(_event, page) => setPollPage(page)}
                      sx={{ alignSelf: 'center' }}
                      color="primary"
                    />
                  ) : null}
                </Stack>
              )}
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Typography variant="h4" component="h2">Competitions</Typography>
              <Typography variant="body1" color="text.secondary">
                Submit your best work for writing challenges and creative competitions curated by the MUSEngage team.
              </Typography>

              <TextField
                label="Search competitions"
                placeholder="Search by title"
                value={competitionSearch}
                onChange={(event) => setCompetitionSearch(event.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />

              {competitionsLoading ? (
                <Typography variant="body1" color="text.secondary">
                  Loading competitions…
                </Typography>
              ) : competitionsError ? (
                <Alert severity="error">{competitionsError}</Alert>
              ) : filteredCompetitions.length === 0 ? (
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
                          <Chip label={competition.isActive ? 'Open' : 'Closed'} color={competition.isActive ? 'primary' : 'default'} />
                          {competition.userSubmission ? <Chip label="Submitted" color="success" /> : null}
                        </Stack>
                      }
                    />
                    <CardContent>
                      {competition.imageUrl ? (
                        <CardMedia
                          component="img"
                          image={competition.imageUrl}
                          srcSet={`${competition.imageUrl} 1x, ${competition.imageUrl} 2x`}
                          sizes="(max-width: 600px) 100vw, 520px"
                          alt={competition.title}
                          loading="lazy"
                          decoding="async"
                          width={520}
                          height={320}
                          sx={{ mb: 2, borderRadius: 1.5, width: '100%', objectFit: 'cover' }}
                        />
                      ) : null}
                      <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 1 }}>
                        {competition.summary}
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {competition.details}
                      </Typography>
                    </CardContent>
                    <CardActions sx={{ px: 3, pb: 3, pt: 0 }}>
                      <Button
                        variant="contained"
                        disabled={!competition.isActive || !isOnline}
                        onClick={() => openSubmissionDialog(competition)}
                        fullWidth
                      >
                        {competition.userSubmission ? 'Update submission' : 'Submit entry'}
                      </Button>
                    </CardActions>
                  </Card>
                  ))}
                  {competitionPageCount > 1 ? (
                    <Pagination
                      count={competitionPageCount}
                      page={competitionPage}
                      onChange={(_event, page) => setCompetitionPage(page)}
                      sx={{ alignSelf: 'center' }}
                      color="primary"
                    />
                  ) : null}
                </Stack>
              )}
            </Stack>
          )}
        </Stack>
      </Container>

      <Dialog open={submissionDialogOpen} onClose={closeSubmissionDialog} fullWidth maxWidth="sm">
        <DialogTitle>
          {submissionCompetition ? `Submit to ${submissionCompetition.title}` : 'Submit entry'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Your submission"
              value={submissionContent}
              onChange={(event) => setSubmissionContent(event.target.value)}
              multiline
              minRows={6}
              placeholder="Share your essay or response here."
            />
            {submissionError ? <Alert severity="error">{submissionError}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeSubmissionDialog} disabled={submissionSaving}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmitCompetition()}
            variant="contained"
            disabled={submissionSaving || !isOnline}
          >
            {submissionSaving ? 'Submitting…' : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>
      </Box>
    </>
  );
};

export default EngagePage;
