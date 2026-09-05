import { Alert, Button, Snackbar } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export type OfflineStatusBannerProps = {
  /**
   * When true, renders a shortcut button that links users to the offline page.
   * Defaults to true so authenticated layouts can guide users to cached content.
   */
  showOfflineLink?: boolean;
};

// Displays a persistent banner whenever the user loses their network connection.
export function OfflineStatusBanner({ showOfflineLink = true }: OfflineStatusBannerProps) {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <Snackbar
      open
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      sx={{ mt: { xs: 7, sm: 8 } }}
    >
      <Alert
        severity="warning"
        variant="filled"
        sx={{ width: '100%' }}
        action={
          showOfflineLink ? (
            <Button color="inherit" size="small" component={RouterLink} to="/offline">
              Offline page
            </Button>
          ) : undefined
        }
      >
        You&apos;re offline. Some actions are disabled until you reconnect.
      </Alert>
    </Snackbar>
  );
}

export default OfflineStatusBanner;
