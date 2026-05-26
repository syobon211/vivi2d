import { useT } from "@/lib/i18n";
import { useNotificationStore } from "@/stores/notificationStore";

export function NotificationToast() {
  const t = useT();
  const notifications = useNotificationStore((s) => s.notifications);
  const dismiss = useNotificationStore((s) => s.dismiss);

  if (notifications.length === 0) return null;

  return (
    <section
      className="notification-container"
      aria-label={t("notifications.regionLabel")}
    >
      {notifications.map((n) => {
        const isError = n.type === "error";
        return (
          <div
            key={n.id}
            className={`notification notification-${n.type}`}
            role={isError ? "alert" : "status"}
            aria-live={isError ? "assertive" : "polite"}
            aria-atomic="true"
          >
            <span className="notification-message">{n.message}</span>
            <button
              type="button"
              className="notification-close"
              aria-label={t("notifications.closeLabel")}
              onClick={() => dismiss(n.id)}
            >
              ×
            </button>
          </div>
        );
      })}
    </section>
  );
}
