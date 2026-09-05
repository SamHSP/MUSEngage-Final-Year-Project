import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useMemo } from 'react';
import { usePushNotificationPreference } from '../hooks/usePushNotificationPreference';

const PushNotificationSettings = () => {
  const {
    supported,
    canManage,
    subscribed,
    loading,
    status,
    ready,
    permissionMessage,
    enablePush,
    disablePush,
    setStatus,
  } = usePushNotificationPreference();

  const showContent = supported && canManage && ready;

  const statusAlert = useMemo(() => {
    if (!status) {
      return null;
    }
    return <Alert severity={status.type}>{status.message}</Alert>;
  }, [status]);

  if (!canManage) {
    return null;
  }

  if (!supported) {
    return (
      <Alert severity="info">
        Your browser does not support push notifications. Try using the installed PWA or a different browser.
      </Alert>
    );
  }

  if (!ready) {
    return (
      <Stack direction="row" alignItems="center" spacing={1}>
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">
          Loading push notification settings…
        </Typography>
      </Stack>
    );
  }

  if (!showContent) {
    return (
      <Alert severity="warning">
        Push notifications are temporarily unavailable. Please try again later.
      </Alert>
    );
  }

  return (
    <Box>
      <Stack spacing={2}>
        <Stack spacing={0.5}>
          <Typography variant="h6">Push notifications</Typography>
          <Typography variant="body2" color="text.secondary">
            {permissionMessage}
          </Typography>
        </Stack>
        {statusAlert}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              setStatus(null);
              void enablePush();
            }}
            disabled={loading || subscribed}
            startIcon={loading ? <CircularProgress size={16} /> : undefined}
          >
            {subscribed ? 'Push enabled' : 'Enable push notifications'}
          </Button>
          <Button
            variant="outlined"
            color="inherit"
            onClick={() => {
              setStatus(null);
              void disablePush();
            }}
            disabled={loading || !subscribed}
          >
            Disable push notifications
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
};

export default PushNotificationSettings;
