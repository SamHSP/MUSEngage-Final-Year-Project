import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import axios from 'axios';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardMedia,
  Chip,
  Collapse,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Fab,
  InputAdornment,
  MenuItem,
  Pagination,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ImageIcon from '@mui/icons-material/Image';
import DeleteIcon from '@mui/icons-material/Delete';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import AddIcon from '@mui/icons-material/Add';
import { useAuth } from '../context/AuthContext';
import PageHero from '../components/PageHero';
import Seo from '../components/Seo';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const API = import.meta.env.VITE_BACKEND_API;

type Comment = {
  id: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  authorProfileImageUrl?: string | null;
  content: string;
  createdAt: string;
};

type UploadResponse = {
  ok: boolean;
  url: string;
};

type PostModerationSummary = {
  id: string;
  status: 'approved' | 'rejected';
  reason: string;
  categories: string[];
};

type PostSubmissionResponse = {
  status: 'approved' | 'rejected';
  post?: Post;
  moderation?: PostModerationSummary | null;
};

const FLAIR_OPTIONS = [
  'Management',
  'International Business',
  'Accounting',
  'Banking & Finance',
  'Business & Management',
  'Marketing',
  'Computer Science',
  'Games Design & Development',
  'Internetworking & Network Security',
  'Business Information Systems',
  'Artificial Intelligence & Autonomous Systems',
  'Cyber Security & Forensics',
  'Games Technology',
  'Mobile & Web Application Development',
] as const;

type Post = {
  id: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  authorProfileImageUrl?: string | null;
  title: string;
  content: string;
  createdAt: string;
  comments: Comment[];
  flair?: string | null;
  imageUrl?: string | null;
  upvoteCount: number;
  upvoters: string[];
};

// Formats timestamps into a concise, human-readable string.
function formatDate(value: string) {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Presents the community discussion board with posts and interactions.
function CommunityPostPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [selectedFlair, setSelectedFlair] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [moderationSummary, setModerationSummary] = useState<PostModerationSummary | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentSubmitting, setCommentSubmitting] = useState<Record<string, boolean>>({});
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isOnline = useOnlineStatus();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<'latest' | 'popular-week'>('latest');
  const [page, setPage] = useState(1);

  const POSTS_PER_PAGE = 6;

  const processedPosts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? posts.filter((post) => post.title.toLowerCase().includes(query))
      : posts;

    if (sortOption === 'latest') {
      return [...filtered].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }

    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    return [...filtered].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      const aRecent = aTime >= oneWeekAgo;
      const bRecent = bTime >= oneWeekAgo;

      if (aRecent && bRecent) {
        const voteDiff = b.upvoteCount - a.upvoteCount;
        if (voteDiff !== 0) {
          return voteDiff;
        }
        return bTime - aTime;
      }

      if (aRecent !== bRecent) {
        return aRecent ? -1 : 1;
      }

      const voteDiff = b.upvoteCount - a.upvoteCount;
      if (voteDiff !== 0) {
        return voteDiff;
      }

      return bTime - aTime;
    });
  }, [posts, searchQuery, sortOption]);

  const pageCount = Math.max(1, Math.ceil(processedPosts.length / POSTS_PER_PAGE));
  const paginatedPosts = useMemo(
    () =>
      processedPosts.slice(
        (page - 1) * POSTS_PER_PAGE,
        (page - 1) * POSTS_PER_PAGE + POSTS_PER_PAGE,
      ),
    [processedPosts, page],
  );

  // Loads the community feed from the backend.
  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get<Post[]>(`${API}/api/posts`);
      setPosts(response.data);
      setError(null);
    } catch (err) {
      console.error('Failed to load community posts', err);
      setError('We could not load the community feed. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, sortOption, posts]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, pageCount));
  }, [pageCount]);

  // Handles image file selection and preview lifecycle.
  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    } else {
      setImageFile(null);
      setImagePreview(null);
    }
  }

  // Resets the post composer to its initial empty state.
  function resetComposer() {
    setNewPostTitle('');
    setNewPostContent('');
    setSelectedFlair('');
    setImageFile(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setModerationSummary(null);
  }

  const handleOpenComposer = () => {
    if (!user) {
      alert('Please log in to share an update.');
      return;
    }
    setComposerOpen(true);
  };

  const handleCloseComposer = () => {
    if (submittingPost) {
      return;
    }
    setComposerOpen(false);
    resetComposer();
  };

  // Uploads the selected image and returns the hosted URL.
  async function uploadImage(): Promise<string | null> {
    if (!imageFile) {
      return null;
    }
    if (!isOnline) {
      alert('You are offline. Reconnect to upload images.');
      return null;
    }
    const form = new FormData();
    form.append('file', imageFile);
    try {
      setImageUploading(true);
      const { data } = await axios.post<UploadResponse>(`${API}/api/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.url;
    } catch (err) {
      console.error('Failed to upload image', err);
      alert("We couldn't upload your image. Please try again.");
      return null;
    } finally {
      setImageUploading(false);
    }
  }

  // Submits a new post to the backend.
  async function handleCreatePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      alert('Please log in to share an update.');
      return;
    }
    if (!isOnline) {
      alert('You are offline. Reconnect to share a post.');
      return;
    }
    if (!newPostTitle.trim()) {
      alert('Please add a title to your post.');
      return;
    }
    if (!newPostContent.trim()) {
      return;
    }

    try {
      setSubmittingPost(true);
      let attachmentUrl: string | null = null;
      if (imageFile) {
        attachmentUrl = await uploadImage();
        if (!attachmentUrl) {
          return;
        }
      }
      const response = await axios.post<PostSubmissionResponse>(`${API}/api/posts`, {
        authorId: user.id,
        title: newPostTitle.trim(),
        content: newPostContent.trim(),
        flair: selectedFlair.trim() ? selectedFlair.trim() : null,
        imageUrl: attachmentUrl,
      });
      if (response.data.status === 'approved' && response.data.post) {
        setPosts((prev) => [response.data.post as Post, ...prev]);
        setModerationSummary(null);
        resetComposer();
        setComposerOpen(false);
      } else if (response.data.status === 'rejected' && response.data.moderation) {
        setModerationSummary(response.data.moderation);
      } else {
        setModerationSummary({
          id: 'unknown',
          status: 'rejected',
          reason: "Your post couldn't be automatically approved and was sent for manual review.",
          categories: [],
        });
      }
    } catch (err) {
      console.error('Failed to create post', err);
      alert("We couldn't share your post. Please try again.");
    } finally {
      setSubmittingPost(false);
    }
  }

  // Sends a comment for the specified post.
  async function handleCreateComment(postId: string, content: string) {
    if (!user) {
      alert('Please log in to comment.');
      return;
    }
    if (!content.trim()) {
      return;
    }
    if (!isOnline) {
      alert('You are offline. Reconnect to add your comment.');
      return;
    }

    try {
      setCommentSubmitting((prev) => ({ ...prev, [postId]: true }));
      const response = await axios.post<Post>(`${API}/api/posts/${postId}/comments`, {
        authorId: user.id,
        content: content.trim(),
      });
      setPosts((prev) => {
        const otherPosts = prev.filter((post) => post.id !== postId);
        return [response.data, ...otherPosts];
      });
      setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
      setExpandedPostId(postId);
    } catch (err) {
      console.error('Failed to add comment', err);
      alert("We couldn't add your comment. Please try again.");
    } finally {
      setCommentSubmitting((prev) => ({ ...prev, [postId]: false }));
    }
  }

  // Toggles the current user's upvote for a post.
  const handleToggleUpvote = useCallback(
    async (post: Post) => {
      if (!user) {
        alert('Please log in to upvote posts.');
        return;
      }
      if (!isOnline) {
        alert('You are offline. Reconnect to update your upvote.');
        return;
      }

      try {
        const hasUpvoted = post.upvoters.includes(user.id);
        if (hasUpvoted) {
          const { data } = await axios.delete<Post>(`${API}/api/posts/${post.id}/upvotes`);
          setPosts((prev) => prev.map((item) => (item.id === post.id ? data : item)));
        } else {
          const { data } = await axios.post<Post>(`${API}/api/posts/${post.id}/upvotes`);
          setPosts((prev) => prev.map((item) => (item.id === post.id ? data : item)));
        }
      } catch (err) {
        console.error('Failed to toggle upvote', err);
        alert("We couldn't update your upvote. Please try again.");
      }
    },
    [isOnline, user],
  );

  // Expands or collapses the comments section for a post.
  function toggleComments(postId: string) {
    setExpandedPostId((prev) => (prev === postId ? null : postId));
  }

  return (
    <>
      <Seo
        title="Community — MUSEngage"
        description="Join student communities, share updates, and collaborate on campus activities."
        canonical="https://musengage.site/community"
      />
      <Box>
      <PageHero
        eyebrow="Murdoch University"
        title="Community Feed"
        description="Share your wins, ask for help and cheer on fellow Murdoch students."
        theme="community"
        ctaLabel="Refresh feed"
        ctaHref="#feed"
        onCtaClick={(event) => {
          event.preventDefault();
          void fetchPosts();
        }}
      />

      <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
        <Stack spacing={6} id="feed">
          <Stack spacing={2}>
            <Typography variant="h4" component="h2">Start a conversation</Typography>
            <Typography variant="body1" color="text.secondary">
              Post updates, questions or ideas to the community. Comments keep the discussion going.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Use the floating action button to compose a new community post.
            </Typography>
            {!user && (
              <Alert severity="info">Log in to share an update or join the conversation.</Alert>
            )}
          </Stack>

          <Stack spacing={2}>
            <Typography variant="h4" component="h2">Latest posts</Typography>
            <Typography variant="body1" color="text.secondary">
              See what the community is talking about right now.
            </Typography>

            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={2}
              alignItems={{ md: 'center' }}
            >
              <TextField
                label="Search posts"
                placeholder="Search by title"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" aria-hidden="true" focusable="false" />
                    </InputAdornment>
                  ),
                }}
                fullWidth
              />
              <TextField
                select
                label="Sort posts"
                value={sortOption}
                onChange={(event) => setSortOption(event.target.value as 'latest' | 'popular-week')}
                sx={{ minWidth: { md: 220 } }}
              >
                <MenuItem value="latest">Latest</MenuItem>
                <MenuItem value="popular-week">Popular this week</MenuItem>
              </TextField>
            </Stack>

            {loading ? (
              <Typography color="text.secondary">Loading community posts…</Typography>
            ) : error ? (
              <Alert severity="error">{error}</Alert>
            ) : processedPosts.length === 0 ? (
              <Alert severity="info">
                {posts.length === 0
                  ? 'No posts yet. Be the first to start the conversation!'
                  : 'No posts match your search.'}
              </Alert>
            ) : (
              <Stack spacing={3}>
                {paginatedPosts.map((post) => {
                  const comments = [...post.comments].sort(
                    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
                  );
                  const draft = commentDrafts[post.id] ?? '';
                  const isSubmitting = commentSubmitting[post.id] ?? false;
                  const isExpanded = expandedPostId === post.id;
                  const hasUpvoted = user ? post.upvoters.includes(user.id) : false;
                  return (
                    <Card key={post.id}>
                      <CardHeader
                        avatar={
                          <Avatar
                            src={post.authorProfileImageUrl ?? undefined}
                            alt={
                              post.authorName
                                ? `${post.authorName} profile photo`
                                : 'Community member profile photo'
                            }
                          >
                            {post.authorName[0]?.toUpperCase() ?? 'M'}
                          </Avatar>
                        }
                        title={
                          <Stack spacing={0.5} alignItems="flex-start">
                            {post.flair ? <Chip label={post.flair} color="primary" size="small" /> : null}
                            <Typography variant="h6">{post.title}</Typography>
                          </Stack>
                        }
                        subheader={
                          <Stack spacing={0.25} alignItems="flex-start">
                            <Typography variant="body2" color="text.secondary">
                              {post.authorName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatDate(post.createdAt)}
                            </Typography>
                          </Stack>
                        }
                      />
                      <CardContent>
                        <Typography variant="body1" sx={{ mb: 2 }}>
                          {post.content}
                        </Typography>
                        {post.imageUrl ? (
                          <Box
                            sx={{ borderRadius: 3, overflow: 'hidden', border: '1px solid', borderColor: 'divider', mb: 2, backgroundColor: 'background.default' }}
                          >
                            <CardMedia
                              component="img"
                              image={post.imageUrl ?? undefined}
                              srcSet={post.imageUrl ? `${post.imageUrl} 1x, ${post.imageUrl} 2x` : undefined}
                              sizes="(max-width: 600px) 100vw, 480px"
                              alt={post.title ? `Attachment for ${post.title}` : 'Community post attachment'}
                              loading="lazy"
                              decoding="async"
                              width={480}
                              height={320}
                              sx={{ width: '100%', borderRadius: 2, objectFit: 'contain' }}
                            />
                          </Box>
                        ) : null}
                        <Stack spacing={1.5} sx={{ mt: 2 }}>
                          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                            <Button
                              variant="contained"
                              color={hasUpvoted ? 'primary' : 'inherit'}
                              startIcon={
                                hasUpvoted ? (
                                  <ThumbUpIcon fontSize="small" aria-hidden="true" focusable="false" />
                                ) : (
                                  <ThumbUpOutlinedIcon fontSize="small" aria-hidden="true" focusable="false" />
                                )
                              }
                              onClick={() => void handleToggleUpvote(post)}
                              aria-pressed={hasUpvoted}
                              disabled={!isOnline}
                              disableElevation
                              size="small"
                              sx={{
                                minWidth: 0,
                                px: 1.5,
                                py: 0.75,
                                borderRadius: 999,
                                textTransform: 'none',
                                fontWeight: 600,
                                gap: 0.5,
                                bgcolor: hasUpvoted ? undefined : 'action.selected',
                                color: hasUpvoted ? undefined : 'text.primary',
                                '& .MuiButton-startIcon': {
                                  margin: 0,
                                },
                                '&:hover': {
                                  bgcolor: hasUpvoted ? undefined : 'action.hover',
                                },
                              }}
                            >
                              <Stack direction="row" spacing={0.75} alignItems="center" component="span">
                                <Typography component="span" variant="button" sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
                                  {hasUpvoted ? 'Upvoted' : 'Upvote'}
                                </Typography>
                                <Box
                                  component="span"
                                  sx={{
                                    px: 0.75,
                                    py: 0.25,
                                    borderRadius: 999,
                                    bgcolor: hasUpvoted ? 'primary.dark' : 'action.focus',
                                    color: hasUpvoted ? 'primary.contrastText' : 'text.primary',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    lineHeight: 1,
                                  }}
                                >
                                  {post.upvoteCount}
                                </Box>
                              </Stack>
                            </Button>
                            <Button
                              variant="contained"
                              color="info"
                              disableElevation
                              onClick={() => toggleComments(post.id)}
                              size="small"
                              sx={{
                                minWidth: 0,
                                px: 1.5,
                                py: 0.75,
                                borderRadius: 999,
                                textTransform: 'none',
                                fontWeight: 600,
                                gap: 0.5,
                              }}
                            >
                              <Stack direction="row" spacing={0.75} alignItems="center" component="span">
                                <Typography component="span" variant="button" sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
                                  {comments.length === 1 ? 'Comment' : 'Comments'}
                                </Typography>
                                <Box
                                  component="span"
                                  sx={{
                                    px: 0.75,
                                    py: 0.25,
                                    borderRadius: 999,
                                    bgcolor: 'rgba(255, 255, 255, 0.24)',
                                    color: 'info.contrastText',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    lineHeight: 1,
                                  }}
                                >
                                  {comments.length}
                                </Box>
                              </Stack>
                            </Button>
                          </Stack>
                          <Button
                            onClick={() => toggleComments(post.id)}
                            sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
                          >
                            {isExpanded ? 'Hide comments' : 'View comments'}
                          </Button>
                        </Stack>
                        <Collapse in={isExpanded} unmountOnExit>
                          <Divider sx={{ my: 2 }} />
                          <Stack spacing={2}>
                            <Typography variant="subtitle1">Comments</Typography>
                            {comments.length === 0 ? (
                              <Typography variant="body2" color="text.secondary">
                                No comments yet.
                              </Typography>
                            ) : (
                              <Stack spacing={2}>
                                {comments.map((comment) => (
                                  <Box key={comment.id} sx={{ display: 'grid', gap: 0.5 }}>
                                    <Typography variant="subtitle2">
                                      {comment.authorName}{' '}
                                      <Typography component="span" variant="caption" color="text.secondary">
                                        • {formatDate(comment.createdAt)}
                                      </Typography>
                                    </Typography>
                                    <Typography variant="body2">{comment.content}</Typography>
                                  </Box>
                                ))}
                              </Stack>
                            )}
                            <Stack
                              component="form"
                              onSubmit={(submitEvent: FormEvent<HTMLFormElement>) => {
                                submitEvent.preventDefault();
                                void handleCreateComment(post.id, draft);
                              }}
                              spacing={2}
                            >
                              <TextField
                                placeholder={user ? 'Write a comment' : 'Log in to leave a comment'}
                                value={draft}
                                onChange={(event) =>
                                  setCommentDrafts((prev) => ({ ...prev, [post.id]: event.target.value }))
                                }
                                disabled={!user || isSubmitting || !isOnline}
                                multiline
                                minRows={2}
                                inputProps={{ maxLength: 300 }}
                              />
                              <Stack direction="row" justifyContent="flex-end">
                                <Button
                                  type="submit"
                                  variant="contained"
                                  disabled={!user || isSubmitting || draft.trim().length === 0 || !isOnline}
                                >
                                  {isSubmitting ? 'Posting…' : 'Comment'}
                                </Button>
                              </Stack>
                            </Stack>
                          </Stack>
                        </Collapse>
                      </CardContent>
                    </Card>
                  );
                })}
                {pageCount > 1 ? (
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
        </Stack>
      </Container>

      {!composerOpen ? (
        <Fab
          color="primary"
          aria-label="Create community post"
          onClick={handleOpenComposer}
          sx={{
            position: 'fixed',
            bottom: { xs: 88, sm: 32 },
            right: { xs: 16, sm: 32 },
            zIndex: (theme) => theme.zIndex.tooltip,
          }}
        >
          <AddIcon aria-hidden="true" focusable="false" />
        </Fab>
      ) : null}

      <Dialog
        open={composerOpen}
        onClose={handleCloseComposer}
        fullWidth
        maxWidth="sm"
        aria-labelledby="community-composer-title"
      >
        <Box component="form" onSubmit={handleCreatePost}>
          <DialogTitle id="community-composer-title">Create community post</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Title"
                  placeholder="Add a clear, descriptive title"
                  value={newPostTitle}
                  onChange={(event) => setNewPostTitle(event.target.value)}
                  required
                  fullWidth
                  disabled={submittingPost || imageUploading || !isOnline}
                  inputProps={{ maxLength: 120 }}
                />
                <Select
                  value={selectedFlair}
                  onChange={(event) => setSelectedFlair(event.target.value)}
                  displayEmpty
                  fullWidth
                  disabled={submittingPost || imageUploading || !isOnline}
                >
                  <MenuItem value="">
                    <em>No flair</em>
                  </MenuItem>
                  {FLAIR_OPTIONS.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </Select>
              </Stack>
              <TextField
                placeholder={`Share something, ${user?.name.split(' ')[0] ?? 'friend'}...`}
                value={newPostContent}
                onChange={(event) => setNewPostContent(event.target.value)}
                disabled={submittingPost || imageUploading || !isOnline}
                multiline
                minRows={4}
                inputProps={{ maxLength: 500 }}
              />
              {moderationSummary ? (
                <Alert severity="warning">
                  {moderationSummary.reason}
                  {moderationSummary.categories.length > 0 ? (
                    <>
                      {' '}
                      <strong>Tags:</strong> {moderationSummary.categories.join(', ')}
                    </>
                  ) : null}
                </Alert>
              ) : null}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                <Button
                  variant="outlined"
                  startIcon={<ImageIcon aria-hidden="true" focusable="false" />}
                  component="label"
                  disabled={submittingPost || imageUploading || !isOnline}
                >
                  Attach image
                  <input
                    ref={fileInputRef}
                    hidden
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                  />
                </Button>
                {imagePreview ? (
                  <Chip
                    label="Image selected"
                    onDelete={() => {
                      if (imagePreview) {
                        URL.revokeObjectURL(imagePreview);
                      }
                      setImageFile(null);
                      setImagePreview(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                      }
                    }}
                    deleteIcon={<DeleteIcon aria-hidden="true" focusable="false" />}
                    color="secondary"
                  />
                ) : null}
                <Box sx={{ flexGrow: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  {newPostContent.trim().length} / 500
                </Typography>
              </Stack>
              {imagePreview ? (
                <Box sx={{ borderRadius: 3, overflow: 'hidden', border: '1px solid', borderColor: 'divider', backgroundColor: 'background.default' }}>
                  <Box component="img" src={imagePreview} alt="Selected attachment preview" sx={{ width: '100%', objectFit: 'contain', maxHeight: 400 }} />
                </Box>
              ) : null}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseComposer} disabled={submittingPost || imageUploading}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={
                submittingPost ||
                imageUploading ||
                !isOnline ||
                newPostContent.trim().length === 0 ||
                !newPostTitle.trim()
              }
              endIcon={
                submittingPost || imageUploading ? (
                  <CircularProgress size={18} aria-hidden="true" />
                ) : undefined
              }
            >
              {submittingPost || imageUploading ? 'Posting…' : 'Post'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
      </Box>
    </>
  );
}

export default CommunityPostPage;
