import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardMedia,
  Container,
  Stack,
  Typography,
} from '@mui/material';
import PageHero from '../components/PageHero';
import Seo from '../components/Seo';
import { useAuth } from '../context/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import type { RewardApi, RewardRecord, RewardRedemptionRecord } from '../types/rewards';

const API = import.meta.env.VITE_BACKEND_API;

type RedeemRewardResponse = {
  ok: boolean;
  message: string;
  totalRewardPoints: number;
  redemption: RewardRedemptionRecord;
};

// Normalises a reward returned from the API.
const mapReward = (api: RewardApi): RewardRecord => ({
  id: api.id,
  name: api.name,
  description: api.description,
  pointsCost: api.pointsCost,
  stock: api.stock,
  imageUrl: api.imageUrl ?? null,
  createdAt: api.created_at,
  updatedAt: api.updated_at,
});

// Lists the available rewards and redemption actions.
const RewardsPage = () => {
  const [rewards, setRewards] = useState<RewardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, setUser } = useAuth();
  const rewardPoints = user?.rewardPoints ?? 0;
  const isOnline = useOnlineStatus();
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [redeemNotice, setRedeemNotice] = useState<
    { severity: 'success' | 'error'; text: string }
    | null
  >(null);

  useEffect(() => {
    const fetchRewards = async () => {
      try {
        const { data } = await axios.get<RewardApi[]>(`${API}/api/rewards`);
        setRewards(data.map(mapReward));
      } catch (err) {
        console.error('Failed to load rewards', err);
        setError('We could not load the rewards catalogue. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    void fetchRewards();
  }, []);

  const handleRedeem = useCallback(
    async (reward: RewardRecord) => {
      if (!user) {
        setRedeemNotice({ severity: 'error', text: 'Sign in to redeem rewards.' });
        return;
      }
      if (user.role === 'guest') {
        setRedeemNotice({ severity: 'error', text: 'Guest accounts cannot redeem rewards.' });
        return;
      }
      if (!isOnline) {
        setRedeemNotice({ severity: 'error', text: 'Reconnect to redeem rewards.' });
        return;
      }
      if (reward.stock <= 0) {
        setRedeemNotice({ severity: 'error', text: 'This reward is currently out of stock.' });
        return;
      }
      if (reward.pointsCost > rewardPoints) {
        setRedeemNotice({ severity: 'error', text: 'You do not have enough reward points yet.' });
        return;
      }

      const confirmed = window.confirm(
        `Redeem ${reward.name} for ${reward.pointsCost.toLocaleString()} points? ` +
          'This redemption cannot be reversed.',
      );
      if (!confirmed) {
        return;
      }

      setRedeemNotice(null);
      setRedeemingId(reward.id);
      try {
        const { data } = await axios.post<RedeemRewardResponse>(
          `${API}/api/rewards/${reward.id}/redeem`,
          {
            userId: user.id,
          },
        );
        setRewards((prev) =>
          prev.map((item) =>
            item.id === reward.id
              ? { ...item, stock: Math.max(0, item.stock - 1) }
              : item,
          ),
        );
        setUser({ ...user, rewardPoints: data.totalRewardPoints });
        setRedeemNotice({ severity: 'success', text: data.message });
      } catch (err) {
        console.error('Failed to redeem reward', err);
        if (axios.isAxiosError(err)) {
          const detail = err.response?.data?.detail;
          if (detail && typeof detail === 'string') {
            setRedeemNotice({ severity: 'error', text: detail });
          } else {
            setRedeemNotice({ severity: 'error', text: 'Unable to redeem this reward right now.' });
          }
        } else {
          setRedeemNotice({ severity: 'error', text: 'Unable to redeem this reward right now.' });
        }
      } finally {
        setRedeemingId(null);
      }
    },
    [isOnline, rewardPoints, setUser, user],
  );

  const isGuest = useMemo(() => user?.role === 'guest', [user?.role]);

  return (
    <Box>
      <Seo
        title="Rewards — MUSEngage"
        description="Earn and redeem rewards for attending events and engaging with the campus community."
        canonical="https://musengage.site/rewards"
      />
      <PageHero
        eyebrow="Murdoch University"
        title="Rewards"
        description="Turn your engagement into meaningful perks, experiences and merchandise."
        theme="rewards"
      />

      <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
        <Stack spacing={6}>
          <Stack spacing={2}>
            <Stack spacing={1} maxWidth={640}>
              <Typography variant="h4">My rewards</Typography>
              {user ? (
                <Typography variant="body1" color="text.secondary">
                  You have <strong>{rewardPoints.toLocaleString()} reward points</strong> ready to redeem.
                </Typography>
              ) : (
                <Typography variant="body1" color="text.secondary">
                  Sign in to view your current reward point balance and start redeeming perks.
                </Typography>
              )}
            </Stack>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  What are reward points?
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Earn points by attending events, scanning campus QR codes and participating in community initiatives. Redeem
                  them for exclusive experiences, merchandise and learning opportunities.
                </Typography>
              </CardContent>
            </Card>
          </Stack>

          <Stack spacing={1} maxWidth={640}>
            <Typography variant="h4">Rewards catalogue</Typography>
            <Typography variant="body1" color="text.secondary">
              Select a reward and our team will follow up to complete the redemption.
            </Typography>
          </Stack>

          {redeemNotice ? (
            <Alert
              severity={redeemNotice.severity}
              onClose={() => setRedeemNotice(null)}
              sx={{ maxWidth: 640 }}
            >
              {redeemNotice.text}
            </Alert>
          ) : null}

          {loading ? (
            <Typography variant="body1" color="text.secondary">
              Loading rewards…
            </Typography>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : rewards.length === 0 ? (
            <Alert severity="info">No rewards are available at the moment. Check back soon!</Alert>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gap: 3,
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
              }}
            >
              {rewards.map((reward) => (
                  <Card key={reward.id} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    {reward.imageUrl ? (
                      <CardMedia
                        component="img"
                        image={reward.imageUrl}
                        alt={reward.name}
                        sx={{ height: 200, objectFit: 'cover' }}
                      />
                    ) : null}
                    <CardContent>
                      <Typography variant="overline" color="warning.main">
                        {reward.pointsCost} points
                      </Typography>
                      <Typography variant="h5" sx={{ mt: 1 }}>
                        {reward.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {reward.description || 'This reward does not have a description yet.'}
                      </Typography>
                      <Typography
                        variant="body2"
                        color={reward.stock > 0 ? 'text.secondary' : 'error.main'}
                        sx={{ mt: 1, fontWeight: 600 }}
                      >
                        {reward.stock > 0
                          ? `${reward.stock.toLocaleString()} in stock`
                          : 'Out of stock'}
                      </Typography>
                    </CardContent>
                    <CardActions sx={{ px: 3, pb: 3, pt: 0, mt: 'auto' }}>
                      <Button
                        variant="contained"
                        color="warning"
                        fullWidth
                        disabled={
                          !isOnline ||
                          !user ||
                          isGuest ||
                          reward.stock <= 0 ||
                          reward.pointsCost > rewardPoints ||
                          redeemingId === reward.id
                        }
                        onClick={() => void handleRedeem(reward)}
                      >
                        {redeemingId === reward.id ? 'Redeeming…' : 'Redeem now'}
                      </Button>
                    </CardActions>
                  </Card>
                ))}
            </Box>
          )}
        </Stack>
      </Container>
    </Box>
  );
};

export default RewardsPage;
