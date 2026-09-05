import { CircularProgress, Stack, Typography } from '@mui/material';

// Displays a consistent loading indicator for lazy routes.
const Loading = () => (
  <Stack
    role="status"
    aria-live="polite"
    spacing={2}
    alignItems="center"
    justifyContent="center"
    sx={{ py: 10 }}
  >
    <CircularProgress aria-label="Loading content" />
    <Typography component="p" variant="body2" color="text.secondary">
      Loading…
    </Typography>
  </Stack>
);

export default Loading;
