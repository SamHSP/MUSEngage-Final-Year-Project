export type RewardApi = {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  stock: number;
  imageUrl?: string | null;
  created_at: string;
  updated_at: string;
};

export type RewardRecord = {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  stock: number;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RewardRedemptionStatus = 'claimed' | 'unclaimed';

export type RewardRedemptionApi = {
  id: string;
  rewardId: string;
  rewardName: string;
  rewardImageUrl?: string | null;
  pointsCost: number;
  userId: string;
  userName: string;
  token: string;
  status: RewardRedemptionStatus;
  created_at: string;
  claimed_at?: string | null;
};

export type RewardRedemptionRecord = {
  id: string;
  rewardId: string;
  rewardName: string;
  rewardImageUrl: string | null;
  pointsCost: number;
  userId: string;
  userName: string;
  token: string;
  status: RewardRedemptionStatus;
  createdAt: string;
  claimedAt: string | null;
};
