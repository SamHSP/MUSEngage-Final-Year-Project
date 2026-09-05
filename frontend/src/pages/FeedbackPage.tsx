import { useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import { Alert, Box, Button, Container, MenuItem, Stack, TextField, Typography } from '@mui/material';
import PageHero from '../components/PageHero';
import { useAuth } from '../context/AuthContext';
import { Helmet } from 'react-helmet-async';

const API = import.meta.env.VITE_BACKEND_API;

// Collects facility feedback from authenticated students.
const FeedbackPage = () => {
  const { user } = useAuth();
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Submits the feedback form to the backend.
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    if (!user) {
      setErrorMessage('Please sign in to submit your feedback.');
      return;
    }

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setErrorMessage('Feedback cannot be empty.');
      return;
    }

    const trimmedCategory = category.trim();
    if (!trimmedCategory) {
      setErrorMessage('Please choose a category for your feedback.');
      return;
    }

    let resolvedCategory: string | null = null;
    if (trimmedCategory.toLowerCase() === 'others') {
      const otherValue = customCategory.trim();
      if (!otherValue) {
        setErrorMessage('Please specify a category for "Others".');
        return;
      }
      resolvedCategory = otherValue;
    } else {
      resolvedCategory = trimmedCategory;
    }

    try {
      setSubmitting(true);
      const payload = {
        userId: user.id,
        message: trimmedMessage,
        category: resolvedCategory,
      };
      await axios.post(`${API}/api/feedback`, payload);
      setSuccessMessage('Thank you! Your feedback has been submitted. Track progress from your dashboard.');
      setMessage('');
      setCategory('');
      setCustomCategory('');
    } catch (error) {
      console.error('Failed to submit feedback', error);
      setErrorMessage('Unable to submit feedback right now. Please try again later.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>MUSEngage | Share feedback</title>
        <meta
          name="description"
          content="Submit feedback and suggestions to help improve the Murdoch University student experience."
        />
      </Helmet>
      <Box>
        <PageHero
        eyebrow="Murdoch University"
        title="Share your feedback"
        description="Let us know what&apos;s working well and what could be improved across campus life at Murdoch University."
        theme="feedback"
      />

      <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
        <Stack spacing={3}>
          <Stack spacing={1}>
            <Typography variant="h4" component="h2">We value your feedback</Typography>
            <Typography variant="body1" color="text.secondary">
              Choose a category and share your thoughts so we can keep improving the student experience.
            </Typography>
          </Stack>

          {!user ? (
            <Alert severity="info" variant="outlined">
              Please sign in to share your feedback. Once logged in, you can track responses in your dashboard.
            </Alert>
          ) : (
            <Box
              component="form"
              onSubmit={handleSubmit}
              sx={{
                display: 'grid',
                gap: 2,
                p: { xs: 3, md: 4 },
                borderRadius: 4,
                backgroundColor: 'background.paper',
                boxShadow: '0 24px 48px rgba(14, 28, 37, 0.08)',
              }}
            >
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Name" value={user.name} fullWidth disabled />
                <TextField label="Email" value={user.email} fullWidth disabled />
              </Stack>
              <TextField
                select
                name="category"
                label="Feedback category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                fullWidth
                required
              >
                <MenuItem value="">Select a category</MenuItem>
                <MenuItem value="Facilities">Facilities</MenuItem>
                <MenuItem value="Academic Support">Academic Support</MenuItem>
                <MenuItem value="Campus Services">Campus Services</MenuItem>
                <MenuItem value="Events & Activities">Events & Activities</MenuItem>
                <MenuItem value="Technology & Wi-Fi">Technology & Wi-Fi</MenuItem>
                <MenuItem value="Wellbeing">Wellbeing</MenuItem>
                <MenuItem value="Others">Others</MenuItem>
              </TextField>
              {category.trim().toLowerCase() === 'others' ? (
                <TextField
                  name="customCategory"
                  label="Tell us more"
                  placeholder="What would you like to give feedback about?"
                  value={customCategory}
                  onChange={(event) => setCustomCategory(event.target.value)}
                  fullWidth
                  required
                />
              ) : null}
              <TextField
                name="feedback"
                label="Your feedback"
                placeholder="Tell us about your experience"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                fullWidth
                required
                multiline
                minRows={5}
              />
              {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
              {successMessage ? <Alert severity="success">{successMessage}</Alert> : null}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="flex-end">
                <Button type="submit" variant="contained" size="large" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit feedback'}
                </Button>
              </Stack>
            </Box>
          )}
        </Stack>
      </Container>
      </Box>
    </>
  );
};

export default FeedbackPage;
