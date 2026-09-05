export type NotificationRecord = {
  id: string;
  recipientId: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  createdAt: string;
  read: boolean;
  readAt: string | null;
};
