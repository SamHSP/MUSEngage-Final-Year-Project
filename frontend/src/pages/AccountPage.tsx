import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import axios, { isAxiosError } from 'axios';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Container,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import UploadIcon from '@mui/icons-material/Upload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadIcon from '@mui/icons-material/Download';
import PageHero from '../components/PageHero';
import { useAuth } from '../context/AuthContext';
import type { User } from '../context/AuthContext';
import { getInitials } from '../utils/user';
import { Helmet } from 'react-helmet-async';

const API = import.meta.env.VITE_BACKEND_API;

type UploadResponse = {
  ok: boolean;
  url: string;
};

const AccountPage = () => {
  const { user, setUser, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.profileImageUrl ?? null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteEmailConfirmation, setDeleteEmailConfirmation] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const initials = useMemo(() => getInitials(name || user?.name || ''), [name, user?.name]);
  const canRemoveAvatar = Boolean(avatarPreview) || Boolean(user?.profileImageUrl);

  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setPendingAvatarFile(file);
    if (file) {
      setAvatarPreview(URL.createObjectURL(file));
      setRemoveAvatar(false);
    }
    event.target.value = '';
  }, []);

  const handleRemoveAvatar = useCallback(() => {
    setPendingAvatarFile(null);
    setAvatarPreview(null);
    setRemoveAvatar(true);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!user) {
        return;
      }
      const trimmedName = name.trim();
      if (!trimmedName) {
        setErrorMessage('Name cannot be empty.');
        setSuccessMessage(null);
        return;
      }

      setSubmitting(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      try {
        let profileImageUrlPayload: string | null | undefined = undefined;
        if (pendingAvatarFile) {
          const formData = new FormData();
          formData.append('file', pendingAvatarFile);
          const response = await axios.post<UploadResponse>(`${API}/api/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          if (!response.data?.url) {
            throw new Error('Upload failed');
          }
          profileImageUrlPayload = response.data.url;
        } else if (removeAvatar && user.profileImageUrl) {
          profileImageUrlPayload = null;
        }

        const payload: Record<string, unknown> = { name: trimmedName };
        if (profileImageUrlPayload !== undefined) {
          payload.profileImageUrl = profileImageUrlPayload;
        }

        const result = await axios.patch<User>(`${API}/api/users/${user.id}`, payload);
        const updatedUser = result.data;
        setUser(updatedUser);
        setSuccessMessage('Your profile has been updated.');
        setPendingAvatarFile(null);
        setRemoveAvatar(false);
        setAvatarPreview(updatedUser.profileImageUrl ?? null);
        setName(updatedUser.name);
      } catch (error) {
        console.error('Failed to update account details', error);
        setErrorMessage('Unable to update your account right now. Please try again later.');
      } finally {
        setSubmitting(false);
      }
    },
    [name, pendingAvatarFile, removeAvatar, setUser, user],
  );

  const handleDownloadData = useCallback(async () => {
    setExportError(null);
    setExporting(true);
    try {
      const response = await axios.get(`${API}/api/users/me/export`, {
        responseType: 'blob',
      });
      const disposition = response.headers['content-disposition'] ?? response.headers['Content-Disposition'];
      let filename = `musengage-data-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      if (typeof disposition === 'string') {
        const match = disposition.match(/filename="?([^";]+)"?/i);
        if (match?.[1]) {
          filename = match[1];
        }
      }
      const blob = new Blob([response.data], { type: response.headers['content-type'] ?? 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export personal data', error);
      if (isAxiosError(error) && error.response?.data) {
        const detail = (error.response.data as { detail?: unknown }).detail;
        if (typeof detail === 'string') {
          setExportError(detail);
        } else {
          setExportError('Unable to download your data right now. Please try again later.');
        }
      } else {
        setExportError('Unable to download your data right now. Please try again later.');
      }
    } finally {
      setExporting(false);
    }
  }, []);

  const handleDeleteAccount = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!user) {
        return;
      }
      const confirmedEmail = deleteEmailConfirmation.trim().toLowerCase();
      const expectedEmail = user.email.toLowerCase();
      if (!confirmedEmail || confirmedEmail !== expectedEmail) {
        setDeleteErrorMessage('Please enter your registered Murdoch University email to confirm deletion.');
        return;
      }
      if (!deleteReason.trim()) {
        setDeleteErrorMessage('Please share a brief reason for leaving so we can continue improving MUSEngage.');
        return;
      }

      setDeleteSubmitting(true);
      setDeleteErrorMessage(null);
      try {
        await axios.delete(`${API}/api/users/me`, {
          data: {
            email: confirmedEmail,
            reason: deleteReason.trim(),
          },
        });
        setDeleteEmailConfirmation('');
        setDeleteReason('');
        await logout();
      } catch (error) {
        console.error('Failed to delete account', error);
        if (isAxiosError(error) && error.response?.data) {
          const detail = (error.response.data as { detail?: unknown }).detail;
          if (typeof detail === 'string') {
            setDeleteErrorMessage(detail);
          } else {
            setDeleteErrorMessage('We could not delete your account. Please verify the details and try again.');
          }
        } else {
          setDeleteErrorMessage('We could not delete your account. Please try again later.');
        }
      } finally {
        setDeleteSubmitting(false);
      }
    },
    [deleteEmailConfirmation, deleteReason, logout, user],
  );

  const handlePasswordChange = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setPasswordSuccess(null);
      setPasswordError(null);

      if (!currentPassword.trim() || !newPassword.trim()) {
        setPasswordError('Both current and new password are required.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setPasswordError('New passwords do not match.');
        return;
      }

      setPasswordSubmitting(true);
      try {
        await axios.post(`${API}/api/users/me/password`, {
          currentPassword: currentPassword.trim(),
          newPassword: newPassword.trim(),
        });
        setPasswordSuccess('Your password has been updated successfully.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } catch (error) {
        console.error('Failed to update password', error);
        if (isAxiosError(error) && error.response?.data) {
          const detail = (error.response.data as { detail?: unknown }).detail;
          if (typeof detail === 'string') {
            setPasswordError(detail);
          } else {
            setPasswordError('Unable to update your password right now. Please try again later.');
          }
        } else {
          setPasswordError('Unable to update your password right now. Please try again later.');
        }
      } finally {
        setPasswordSubmitting(false);
      }
    },
    [confirmPassword, currentPassword, newPassword],
  );

  if (!user) {
    return null;
  }

  return (
    <>
      <Helmet>
        <title>MUSEngage | My account</title>
        <meta
          name="description"
          content="Manage your profile details, avatar and contact information within your MUSEngage account."
        />
      </Helmet>
      <Box>
        <PageHero
          eyebrow="Account settings"
          title="My account"
          description="Update your personal details and profile picture so your peers recognise you across MUSEngage."
          theme="profile"
        />
        <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
          <Stack spacing={4}>
            <Box
              component="form"
              onSubmit={handleSubmit}
              sx={{
                backgroundColor: 'background.paper',
                borderRadius: 1,
                boxShadow: '0 24px 48px rgba(14, 28, 37, 0.08)',
                p: { xs: 3, md: 4 },
              }}
            >
              <Stack spacing={3}>
                {successMessage ? <Alert severity="success">{successMessage}</Alert> : null}
                {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={{ xs: 2, sm: 4 }}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                >
                  <Avatar
                    src={avatarPreview ?? undefined}
                    alt={name || user.name}
                    sx={{ width: 96, height: 96, fontSize: 32, bgcolor: 'primary.main', color: 'primary.contrastText' }}
                  >
                    {initials}
                  </Avatar>
                  <Stack spacing={1}>
                    <Stack spacing={1} direction={{ xs: 'column', sm: 'row' }}>
                      <Button
                        component="label"
                        variant="outlined"
                        startIcon={<UploadIcon />}
                        disabled={submitting}
                      >
                        Upload new photo
                        <input hidden type="file" accept="image/*" onChange={handleFileChange} />
                      </Button>
                      {canRemoveAvatar ? (
                        <Button
                          type="button"
                          variant="text"
                          color="error"
                          startIcon={<DeleteOutlineIcon />}
                          onClick={handleRemoveAvatar}
                          disabled={submitting}
                        >
                          Remove photo
                        </Button>
                      ) : null}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Use a clear, square image (at least 256px) so your profile looks great across the platform.
                    </Typography>
                  </Stack>
                </Stack>

                <Divider />

                <Stack spacing={2}>
                  <TextField
                    label="Full name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    fullWidth
                    required
                  />
                  <TextField label="Email" value={user.email} fullWidth disabled />
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="flex-end">
                  <Button type="submit" variant="contained" size="large" disabled={submitting}>
                    {submitting ? 'Saving…' : 'Save changes'}
                  </Button>
                </Stack>
              </Stack>
            </Box>

            <Box
              sx={{
                backgroundColor: 'background.paper',
                borderRadius: 1,
                boxShadow: '0 24px 48px rgba(14, 28, 37, 0.08)',
                p: { xs: 3, md: 4 },
              }}
            >
              <Stack spacing={3}>
                <Stack spacing={1}>
                  <Typography variant="h5">Privacy controls</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Exercise your rights by exporting your data or requesting account deletion.
                  </Typography>
                </Stack>

                <Stack spacing={1.5}>
                  <Typography variant="h6">Download my data</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Download a JSON report containing your profile details, posts, RSVPs and feedback history.
                  </Typography>
                  {exportError ? <Alert severity="error">{exportError}</Alert> : null}
                  <Button
                    type="button"
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    onClick={handleDownloadData}
                    disabled={exporting}
                  >
                    {exporting ? 'Preparing export…' : 'Download JSON export'}
                  </Button>
                </Stack>

                <Stack spacing={1.5}>
                  <Typography variant="h6">Change password</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Update your account password to keep your profile secure.
                  </Typography>
                  {passwordSuccess ? <Alert severity="success">{passwordSuccess}</Alert> : null}
                  {passwordError ? <Alert severity="error">{passwordError}</Alert> : null}
                  <Stack component="form" spacing={2} onSubmit={handlePasswordChange}>
                    <TextField
                      label="Current password"
                      type="password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      required
                      autoComplete="current-password"
                      disabled={passwordSubmitting}
                    />
                    <TextField
                      label="New password"
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      required
                      autoComplete="new-password"
                      disabled={passwordSubmitting}
                      helperText="Use at least 12 characters with a mix of letters, numbers, and symbols."
                    />
                    <TextField
                      label="Confirm new password"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                      autoComplete="new-password"
                      disabled={passwordSubmitting}
                    />
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      <Button type="submit" variant="contained" disabled={passwordSubmitting}>
                        {passwordSubmitting ? 'Updating…' : 'Update password'}
                      </Button>
                      <Button
                        type="button"
                        variant="outlined"
                        disabled={passwordSubmitting}
                        onClick={() => {
                          setCurrentPassword('');
                          setNewPassword('');
                          setConfirmPassword('');
                          setPasswordError(null);
                          setPasswordSuccess(null);
                        }}
                      >
                        Reset fields
                      </Button>
                    </Stack>
                  </Stack>
                </Stack>

                <Divider />

                <Stack component="form" spacing={2} onSubmit={handleDeleteAccount}>
                  <Typography variant="h6" color="error.main">
                    Delete account
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Deleting your account immediately revokes access and anonymises your contributions. This action cannot be
                    undone.
                  </Typography>
                  {deleteErrorMessage ? <Alert severity="error">{deleteErrorMessage}</Alert> : null}
                  <TextField
                    label="Confirm with your Murdoch email"
                    value={deleteEmailConfirmation}
                    onChange={(event) => {
                      setDeleteEmailConfirmation(event.target.value);
                      setDeleteErrorMessage(null);
                    }}
                    required
                    type="email"
                    disabled={deleteSubmitting}
                  />
                  <TextField
                    label="Reason for leaving"
                    value={deleteReason}
                    onChange={(event) => {
                      setDeleteReason(event.target.value);
                      setDeleteErrorMessage(null);
                    }}
                    required
                    multiline
                    minRows={3}
                    disabled={deleteSubmitting}
                    placeholder="Let us know why you are deleting your account"
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="flex-end">
                    <Button
                      type="submit"
                      variant="contained"
                      color="error"
                      startIcon={<DeleteOutlineIcon />}
                      disabled={deleteSubmitting}
                    >
                      {deleteSubmitting ? 'Deleting…' : 'Delete my account'}
                    </Button>
                  </Stack>
                </Stack>
              </Stack>
            </Box>
          </Stack>
        </Container>
      </Box>
    </>
  );
};

export default AccountPage;
