export type FeedbackRecord = {
  id: string;
  message: string;
  status: string;
  category: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EventRecord = {
  id: string;
  title: string;
  subHeader: string;
  body: string;
  imageUrl: string | null;
  rewardPoints: number;
  createdAt: string;
  updatedAt: string | null;
  attendanceConfirmed: boolean;
  attendanceConfirmedAt: string | null;
  links: { label: string; url: string }[];
  tags: string[];
  qrCodeUrl?: string | null;
};

export type PassSessionRecord = {
  id: string;
  meetingTime: string;
  studentLecturer: string;
  venue: string;
  meetLink: string;
};

export type PurchaseRecord = {
  id: string;
  userId: string;
  userEmail: string;
  shippingAddress: string;
  totalAmount: number;
  status: string;
  checkoutSessionId: string | null;
  createdAt: string;
  items: { name: string; price: number; quantity: number }[];
};

export type { RewardRedemptionRecord } from './rewards';
