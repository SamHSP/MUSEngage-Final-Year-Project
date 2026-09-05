import { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import type { ChangeEvent, MouseEvent, ReactElement } from 'react';
import { Link as RouterLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Link,
  Fade,
  Button,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Switch,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { useAuth } from './context/AuthContext';
import type { UserRole } from './context/AuthContext';
import { useNotifications } from './context/useNotifications';
import type { NotificationRecord } from './types/notifications';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { usePushNotificationPreference } from './hooks/usePushNotificationPreference';
import OfflineStatusBanner from './components/OfflineStatusBanner';
import { getInitials } from './utils/user';
import Loading from './components/Loading';
import OfflinePage from './pages/OfflinePage';
import { useTheme as useThemeMode } from './context/ThemeContext';
import PrivacyConsentBanner from './components/PrivacyConsentBanner';

const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const AnalyticsPage = lazy(() => import('./pages/analytics/AnalyticsPage'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const ShopPage = lazy(() => import('./pages/ShopPage'));
const RewardsPage = lazy(() => import('./pages/RewardsPage'));
const EngagePage = lazy(() => import('./pages/EngagePage'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const QrScannerPage = lazy(() => import('./pages/QrScannerPage'));
const PassScannerPage = lazy(() => import('./pages/PassScannerPage'));
const RewardScannerPage = lazy(() => import('./pages/RewardScannerPage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const SignupPage = lazy(() => import('./pages/auth/SignupPage'));
const OtpPage = lazy(() => import('./pages/auth/OtpPage'));
const VerifyEmailPage = lazy(() => import('./pages/auth/VerifyEmailPage'));
const CommunityPostPage = lazy(() => import('./pages/CommunityPostPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsOfServicePage = lazy(() => import('./pages/TermsOfServicePage'));

type NavLinkItem = {
  to: string;
  label: string;
  allowedRoles?: UserRole[];
};

const NAV_LINKS: NavLinkItem[] = [
  { to: '/dashboard', label: 'Dashboard', allowedRoles: ['student', 'admin'] },
  { to: '/events', label: 'Events', allowedRoles: ['student', 'admin', 'guest'] },
  { to: '/community', label: 'Community', allowedRoles: ['student', 'admin'] },
  { to: '/engage', label: 'Engage', allowedRoles: ['student', 'admin'] },
  { to: '/shop', label: 'Shop', allowedRoles: ['student', 'admin', 'guest'] },
  { to: '/rewards', label: 'Rewards', allowedRoles: ['student', 'admin'] },
  { to: '/feedback', label: 'Feedback', allowedRoles: ['student', 'admin'] },
  { to: '/about', label: 'About', allowedRoles: ['student', 'admin', 'guest'] },
  { to: '/admin', label: 'Admin', allowedRoles: ['admin'] },
  { to: '/analytics', label: 'Analytics', allowedRoles: ['admin'] },
];

type RequireAuthProps = {
  children: ReactElement;
  allowedRoles?: UserRole[];
};

// Ensures only authenticated users (optionally with a specific role) can view a route.
function RequireAuth({ children, allowedRoles }: RequireAuthProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Loading />;
  }

  if (!user) {
    return <Navigate to="/about" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const redirectTo = user.role === 'guest' ? '/events' : '/dashboard';
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}

// Determines where to send users when visiting the root or an unknown path.
function ResolveDefaultRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <Loading />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/" replace />;
}

// Defines application routes and shared layouts.
function App() {
  return (
    <>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<LandingPage />} />
          <Route path="/about" element={<LandingPage />} />
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/otp" element={<OtpPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
          </Route>
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/terms-of-service" element={<TermsOfServicePage />} />
          <Route path="/offline" element={<OfflinePage />} />
          <Route
            element={
              <RequireAuth allowedRoles={['student', 'admin', 'guest']}>
                <Layout />
              </RequireAuth>
            }
          >
            <Route
              path="/dashboard"
              element={
                <RequireAuth allowedRoles={['student', 'admin']}>
                  <DashboardPage />
                </RequireAuth>
              }
            />
            <Route path="/events" element={<EventsPage />} />
            <Route
              path="/community"
              element={
                <RequireAuth allowedRoles={['student', 'admin']}>
                  <CommunityPostPage />
                </RequireAuth>
              }
            />
            <Route
              path="/engage"
              element={
                <RequireAuth allowedRoles={['student', 'admin']}>
                  <EngagePage />
                </RequireAuth>
              }
            />
            <Route path="/shop" element={<ShopPage />} />
            <Route
              path="/rewards"
              element={
                <RequireAuth allowedRoles={['student', 'admin']}>
                  <RewardsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/feedback"
              element={
                <RequireAuth allowedRoles={['student', 'admin']}>
                  <FeedbackPage />
                </RequireAuth>
              }
            />
            <Route
              path="/account"
              element={
                <RequireAuth allowedRoles={['student', 'admin']}>
                  <AccountPage />
                </RequireAuth>
              }
            />
            <Route
              path="/qr"
              element={
                <RequireAuth allowedRoles={['student', 'admin']}>
                  <QrScannerPage />
                </RequireAuth>
              }
            />
            <Route
              path="/pass-scanner"
              element={
                <RequireAuth allowedRoles={['student', 'admin']}>
                  <PassScannerPage />
                </RequireAuth>
              }
            />
            <Route
              path="/reward-scanner"
              element={
                <RequireAuth allowedRoles={['admin']}>
                  <RewardScannerPage />
                </RequireAuth>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireAuth allowedRoles={['admin']}>
                  <AdminDashboardPage />
                </RequireAuth>
              }
            />
            <Route
              path="/analytics"
              element={
                <RequireAuth allowedRoles={['admin']}>
                  <AnalyticsPage />
                </RequireAuth>
              }
            />
          </Route>
          <Route path="*" element={<ResolveDefaultRoute />} />
        </Routes>
      </Suspense>
      <PrivacyConsentBanner />
    </>
  );
}

// Provides the main shell (navigation, drawer and footer) for authenticated views.
function Layout() {
  const theme = useMuiTheme();
  const { darkMode, toggleTheme } = useThemeMode();
  const location = useLocation();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuAnchor, setAccountMenuAnchor] = useState<null | HTMLElement>(null);
  const [notificationAnchor, setNotificationAnchor] = useState<null | HTMLElement>(null);
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll, refresh } = useNotifications();
  const isOnline = useOnlineStatus();
  const {
    supported: pushSupported,
    canManage: canManagePush,
    subscribed: pushSubscribed,
    loading: pushLoading,
    status: pushStatus,
    ready: pushReady,
    permissionMessage: pushPermissionMessage,
    enablePush,
    disablePush,
    setStatus: setPushStatus,
  } = usePushNotificationPreference();
  const homeRoute = user?.role === 'guest' ? '/events' : '/dashboard';
  const accountMenuOpen = Boolean(accountMenuAnchor);
  const notificationMenuOpen = Boolean(notificationAnchor);
  const pushToggleAvailable = pushSupported && canManagePush && pushReady;
  const pushHelperText = useMemo(() => {
    if (!canManagePush) {
      return 'Push notifications are available after signing in with a student or admin account.';
    }
    if (!pushSupported) {
      return 'Push notifications are not supported on this device.';
    }
    if (!pushReady) {
      return 'Loading push notification settings…';
    }
    return pushPermissionMessage;
  }, [canManagePush, pushPermissionMessage, pushReady, pushSupported]);

  const handleAccountMenuOpen = useCallback((event: MouseEvent<HTMLElement>) => {
    setAccountMenuAnchor(event.currentTarget);
  }, []);

  const handleAccountMenuClose = useCallback(() => {
    setAccountMenuAnchor(null);
  }, []);

  const handleThemeToggle = useCallback(() => {
    toggleTheme();
    handleAccountMenuClose();
  }, [handleAccountMenuClose, toggleTheme]);

  const handleLogout = useCallback(() => {
    if (!isOnline) {
      return;
    }
    setAccountMenuAnchor(null);
    void logout();
  }, [isOnline, logout]);

  const handleNotificationMenuOpen = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      setNotificationAnchor(event.currentTarget);
      void refresh({ suppressToast: true });
    },
    [refresh],
  );

  const handleNotificationMenuClose = useCallback(() => {
    setNotificationAnchor(null);
  }, []);

  const handleNotificationSelect = useCallback(
    (notification: NotificationRecord) => {
      setNotificationAnchor(null);
      void markAsRead(notification.id);
      const notificationType = (notification.type ?? '').toString();
      if (notificationType === 'admin_broadcast') {
        return;
      }
      if (notificationType === 'event_created') {
        navigate('/events');
        return;
      }
      if (notificationType === 'feedback_submitted' || notificationType === 'post_rejected') {
        navigate('/admin');
        return;
      }
      if (notification.url) {
        try {
          const targetUrl = new URL(notification.url, window.location.origin);
          if (targetUrl.origin === window.location.origin) {
            navigate(`${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`);
          } else {
            window.open(notification.url, '_blank');
          }
        } catch (error) {
          if (import.meta.env.DEV) {
            console.warn('Unable to open notification link', error);
          }
        }
      }
    },
    [markAsRead, navigate],
  );

  const handleMarkAllNotificationsRead = useCallback(() => {
    setNotificationAnchor(null);
    void markAllAsRead();
  }, [markAllAsRead]);

  const handleClearNotifications = useCallback(() => {
    setNotificationAnchor(null);
    void clearAll();
  }, [clearAll]);

  const handlePushToggle = useCallback(
    (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      setPushStatus(null);
      if (checked) {
        void enablePush();
      } else {
        void disablePush();
      }
    },
    [disablePush, enablePush, setPushStatus],
  );

  const displayedNotifications = useMemo(
    () => (notifications.length > 10 ? notifications.slice(0, 10) : notifications),
    [notifications],
  );

  const navigationLinks = useMemo(
    () =>
      NAV_LINKS.filter((link) => {
        if (!link.allowedRoles) {
          return true;
        }
        if (!user) {
          return false;
        }
        return link.allowedRoles.includes(user.role);
      }),
    [user],
  );

  const isLinkActive = (to: string) => {
    if (to === '/dashboard') {
      return location.pathname === to;
    }
    return location.pathname.startsWith(to);
  };

  const navigation = (
    <Stack direction={isDesktop ? 'row' : 'column'} spacing={isDesktop ? 1 : 0} sx={{ width: '100%' }}>
      {navigationLinks.map((link) => {
        const active = isLinkActive(link.to);
        return (
          <Button
            key={link.to}
            component={RouterLink}
            to={link.to}
            onClick={() => setMenuOpen(false)}
            sx={{
              justifyContent: isDesktop ? 'center' : 'flex-start',
              color: active ? 'primary.main' : 'text.secondary',
              borderRadius: theme.shape.borderRadius,
              px: isDesktop ? 2 : 1.5,
              py: isDesktop ? 1 : 1.25,
              backgroundColor: active ? 'rgba(225, 39, 68, 0.16)' : 'transparent',
              '&:hover': {
                backgroundColor: 'rgba(225, 39, 68, 0.1)',
              },
            }}
          >
            {link.label}
          </Button>
        );
      })}
    </Stack>
  );

  return (
    <Box minHeight="100vh" display="flex" flexDirection="column" bgcolor="background.default">
      <AppBar position="sticky">
        <Toolbar sx={{ gap: 2 }}>
          {!isDesktop ? (
            <IconButton color="inherit" onClick={() => setMenuOpen(true)} aria-label="Open navigation menu">
              <MenuIcon />
            </IconButton>
          ) : null}
          <Stack
            component={RouterLink}
            to={homeRoute}
            direction="row"
            alignItems="center"
            spacing={1.25}
            sx={{
              textDecoration: 'none',
              color: 'primary.dark',
              ml: isDesktop ? 0 : 0.5,
              flexWrap: 'wrap',
              rowGap: 0.25,
            }}
            onClick={() => setMenuOpen(false)}
          >
            <Box
              component="img"
              src="/murdoch_university-clear.png"
              alt="Murdoch University logo"
              sx={{
                height: isDesktop ? 40 : 30,
                ml: -10,
                mr: -12,
                pb: .2,
              }}
            />


            {/* <Typography variant={isDesktop ? 'h6' : 'subtitle1'} color="primary.main" sx={{ fontWeight: 700 }}> */}
            {/*  | */}
            {/* </Typography> */}
            {/* <Typography variant={isDesktop ? 'h6' : 'subtitle1'} color="primary.main" sx={{ fontWeight: 700 }}> */}
            {/*   MUSEngage */}
            {/* </Typography> */}
          </Stack>
          <Box flexGrow={1} />
          {isDesktop ? navigation : null}
          {user && user.role !== 'guest' ? (
            <Tooltip title={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}>
              <IconButton
                color="inherit"
                onClick={handleNotificationMenuOpen}
                aria-label="Open notifications"
                sx={{ mr: 1 }}
              >
                <Badge badgeContent={unreadCount} color="error" max={99} overlap="circular">
                  <NotificationsNoneIcon />
                </Badge>
              </IconButton>
            </Tooltip>
          ) : null}
          {user ? (
            <Tooltip title="Account">
              <IconButton
                onClick={handleAccountMenuOpen}
                size="small"
                sx={{ ml: isDesktop ? 2 : 0 }}
                aria-label="Open account menu"
              >
                <Avatar
                  src={user.profileImageUrl ?? undefined}
                  alt={user.name}
                  sx={{ width: 36, height: 36, bgcolor: 'primary.main', color: 'primary.contrastText' }}
                >
                  {getInitials(user.name)}
                </Avatar>
              </IconButton>
            </Tooltip>
          ) : null}
        </Toolbar>
      </AppBar>

      {user && user.role !== 'guest' ? (
        <Menu
          anchorEl={notificationAnchor}
          open={notificationMenuOpen}
          onClose={handleNotificationMenuClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          keepMounted
          PaperProps={{ sx: { maxWidth: 360, width: '100%' } }}
        >
          <MenuItem disabled>
            <ListItemText
              primary="Notifications"
              secondary={unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up!'}
              primaryTypographyProps={{ fontWeight: 600 }}
            />
          </MenuItem>
          <Divider sx={{ my: 0.5 }} />
          {displayedNotifications.length === 0 ? (
            <MenuItem disabled>
              <ListItemText primary="No notifications yet." />
            </MenuItem>
          ) : (
            displayedNotifications.map((notification) => (
              <MenuItem
                key={notification.id}
                onClick={() => handleNotificationSelect(notification)}
                selected={!notification.read}
                sx={{ alignItems: 'flex-start', whiteSpace: 'normal' }}
              >
                <ListItemText
                  primary={notification.title}
                  secondary={
                    <Stack spacing={0.5}>
                      <Typography variant="body2" color="text.secondary">
                        {notification.body}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {new Date(notification.createdAt).toLocaleString()}
                      </Typography>
                    </Stack>
                  }
                  primaryTypographyProps={{ fontWeight: notification.read ? 500 : 700 }}
                />
              </MenuItem>
            ))
          )}
          {canManagePush ? (
            <>
              <Divider sx={{ my: 0.5 }} />
              <Box
                component="li"
                role="presentation"
                tabIndex={-1}
                onClick={(event) => {
                  event.stopPropagation();
                }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                }}
                onTouchStart={(event) => {
                  event.stopPropagation();
                }}
                sx={{
                  py: 1.5,
                  px: 2,
                  cursor: 'default',
                  whiteSpace: 'normal',
                }}
              >
                <Stack spacing={0.75}>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <NotificationsActiveIcon
                        fontSize="small"
                        color={pushSubscribed ? 'primary' : 'action'}
                      />
                      <Typography variant="body2" fontWeight={600}>
                        Push notifications
                      </Typography>
                    </Stack>
                    <Switch
                      edge="end"
                      checked={pushSubscribed}
                      onChange={handlePushToggle}
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                      onMouseDown={(event) => {
                        event.stopPropagation();
                      }}
                      onTouchStart={(event) => {
                        event.stopPropagation();
                      }}
                      disabled={!pushToggleAvailable || pushLoading}
                      inputProps={{ 'aria-label': 'Toggle push notifications' }}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {pushHelperText}
                  </Typography>
                  {pushStatus ? (
                    <Typography
                      variant="caption"
                      sx={{
                        color:
                          pushStatus.type === 'error'
                            ? 'error.main'
                            : pushStatus.type === 'success'
                              ? 'success.main'
                              : 'text.secondary',
                      }}
                    >
                      {pushStatus.message}
                    </Typography>
                  ) : null}
                </Stack>
              </Box>
            </>
          ) : null}
          <Divider sx={{ my: 0.5 }} />
          <MenuItem onClick={handleMarkAllNotificationsRead} disabled={unreadCount === 0}>
            <ListItemIcon>
              <DoneAllIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Mark all as read" />
          </MenuItem>
          <MenuItem onClick={handleClearNotifications} disabled={notifications.length === 0}>
            <ListItemIcon>
              <ClearAllIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Clear notifications" />
          </MenuItem>
        </Menu>
      ) : null}

      {user ? (
        <Menu
          anchorEl={accountMenuAnchor}
          open={accountMenuOpen}
          onClose={handleAccountMenuClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          keepMounted
        >
          <MenuItem disabled>
            <ListItemIcon>
              <AccountCircleIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={user.name}
              secondary={user.email}
              primaryTypographyProps={{ fontWeight: 600 }}
            />
          </MenuItem>
          {user.role !== 'guest' ? (
            <MenuItem
              onClick={() => {
                handleAccountMenuClose();
                navigate('/account');
              }}
            >
              <ListItemIcon>
                <ManageAccountsIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="My account" />
            </MenuItem>
          ) : null}
          <MenuItem onClick={handleThemeToggle}>
            <ListItemIcon>
              {darkMode ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText primary={darkMode ? 'Light mode' : 'Dark mode'} />
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleAccountMenuClose();
              handleLogout();
            }}
            disabled={!isOnline}
          >
            <ListItemIcon>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Logout" />
          </MenuItem>
        </Menu>
      ) : null}

      <Drawer
        anchor="left"
        open={menuOpen && !isDesktop}
        onClose={() => setMenuOpen(false)}
        PaperProps={{
          sx: {
            width: 280,
            paddingTop: 2,
            paddingX: 2,
          },
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="subtitle1" color="text.secondary">
            Navigation
          </Typography>
          <IconButton onClick={() => setMenuOpen(false)} aria-label="Close navigation menu">
            <CloseIcon />
          </IconButton>
        </Stack>
        <Divider sx={{ mb: 2 }} />
        <List disablePadding>
          {navigationLinks.map((link) => (
            <ListItem disableGutters key={link.to} sx={{ mb: 0.5 }}>
              <ListItemButton
                component={RouterLink}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                sx={{
                  borderRadius: 2,
                  ...(isLinkActive(link.to) && {
                    backgroundColor: 'rgba(225, 39, 68, 0.16)',
                    color: 'primary.main',
                  }),
                }}
              >
                <ListItemText primary={link.label} />
              </ListItemButton>
            </ListItem>
          ))}
          {user && user.role !== 'guest' ? (
            <ListItem disableGutters>
              <ListItemButton
                component={RouterLink}
                to="/account"
                onClick={() => setMenuOpen(false)}
              >
                <ListItemIcon>
                  <ManageAccountsIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="My account" />
              </ListItemButton>
            </ListItem>
          ) : null}
          {user ? (
            <ListItem disableGutters>
              <ListItemButton
                onClick={() => {
                  setMenuOpen(false);
                  handleLogout();
                }}
                disabled={!isOnline}
              >
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Logout" />
              </ListItemButton>
            </ListItem>
          ) : null}
        </List>
      </Drawer>

      <Box component="main" flexGrow={1} sx={{ position: 'relative' }}>
        <Fade in key={location.pathname} timeout={400} appear>
          <Box sx={{ height: '100%' }}>
            <Outlet />
          </Box>
        </Fade>
      </Box>

      <Box component="footer" sx={{ backgroundColor: 'background.paper', borderTop: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
          >
            <Box>
              <Typography variant="subtitle1" color="text.primary">
                Murdoch University Singapore
              </Typography>
              <Typography variant="body2" color="text.secondary">
                555-555-5555 or [ email address ]
              </Typography>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }}>
              <Link
                component={RouterLink}
                to="/privacy-policy"
                color="text.secondary"
                underline="hover"
              >
                Privacy Policy
              </Link>
              <Link
                component={RouterLink}
                to="/terms-of-service"
                color="text.secondary"
                underline="hover"
              >
                Terms of Service
              </Link>
            </Stack>
            <Typography variant="body2" color="text.secondary" textAlign={{ xs: 'left', sm: 'right' }}>
              © {new Date().getFullYear()} MUSEngage
            </Typography>
          </Stack>
        </Container>
      </Box>
      <OfflineStatusBanner />
    </Box>
  );
}

// Renders a centered card for authentication flows.
function AuthLayout() {
  const theme = useMuiTheme();
  const location = useLocation();
  return (
    <Box
      minHeight="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      sx={{
        py: { xs: 6, md: 10 },
        px: 2,
        backgroundImage:
          theme.palette.mode === 'dark'
            ? `radial-gradient(circle at top right, ${theme.palette.primary.dark}33, transparent 55%), radial-gradient(circle at bottom left, ${theme.palette.secondary.dark}33, transparent 60%)`
            : `radial-gradient(circle at top right, ${theme.palette.primary.light}22, transparent 55%), radial-gradient(circle at bottom left, ${theme.palette.secondary.light}22, transparent 60%)`,
        backgroundColor: 'background.default',
      }}
    >
      <OfflineStatusBanner />
      <Container maxWidth="sm">
        <Fade in key={location.pathname} timeout={400} appear>
          <Box
            sx={{
              backgroundColor: 'background.paper',
              borderRadius: 1,
              boxShadow: '0 30px 70px rgba(14, 28, 37, 0.12)',
              border: '1px solid',
              borderColor: 'divider',
              px: { xs: 3, sm: 6 },
              py: { xs: 4, sm: 6 },
            }}
          >
            <Outlet />
          </Box>
        </Fade>
      </Container>
    </Box>
  );
}

export default App;
