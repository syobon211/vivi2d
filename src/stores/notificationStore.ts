import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";

export interface Notification {
  id: string;
  type: "error" | "warning" | "info";
  message: string;
}

interface NotificationState {
  notifications: Notification[];
  addNotification: (type: Notification["type"], message: string) => void;
  dismiss: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>()(
  withStandardMiddleware<NotificationState>(
    (set) => ({
      notifications: [],

      addNotification: (type, message) => {
        const id = crypto.randomUUID();
        set((state) => ({
          notifications: [...state.notifications, { id, type, message }],
        }));
        setTimeout(() => {
          set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id),
          }));
        }, 5000);
      },

      dismiss: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),
    }),
    { name: "NotificationStore", persistEnabled: false },
  ),
);
