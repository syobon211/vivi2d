import { BUILTIN_TEMPLATES } from "@vivi2d/core/templates";
import type { TemplateCategory } from "@vivi2d/core/types";
import { useCallback, useState } from "react";
import { useI18nStore, useT } from "@/lib/i18n";
import { localizeTemplateForLocale } from "@/lib/template-localization";
import { useNotificationStore } from "@/stores/notificationStore";
import { useTemplateStore } from "@/stores/templateStore";

interface TemplateDropdownProps {
  category: TemplateCategory;
}

export function TemplateDropdown({ category }: TemplateDropdownProps) {
  const t = useT();
  const locale = useI18nStore((s) => s.locale);
  const [open, setOpen] = useState(false);
  const applyTemplate = useTemplateStore((s) => s.applyTemplate);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const templates = BUILTIN_TEMPLATES.filter((t) => t.category === category).map((template) =>
    localizeTemplateForLocale(template, locale),
  );

  const handleApply = useCallback(
    (templateId: string) => {
      const result = applyTemplate(templateId);
      const template = BUILTIN_TEMPLATES.find((t) => t.id === templateId);
      const localizedTemplate = template
        ? localizeTemplateForLocale(template, locale)
        : null;
      if (result && template) {
        if (result.added !== undefined) {
          addNotification(
            "info",
            `${t("template.label")} "${localizedTemplate?.name ?? template.name}": ${result.added}${t(
              "template.addedCountSuffix",
            )}, ${result.skipped ?? 0}${t("template.skippedCountSuffix")}`,
          );
        } else {
          addNotification(
            "info",
            `${t("template.applied")}: ${localizedTemplate?.name ?? template.name}`,
          );
        }
      }
      setOpen(false);
    },
    [applyTemplate, addNotification, locale, t],
  );

  if (templates.length === 0) return null;

  return (
    <div className="template-dropdown">
      <button
        type="button"
        className="template-dropdown-btn"
        onClick={() => setOpen(!open)}
        title={t("template.addFromTitle")}
      >
        {t("template.label")}
      </button>
      {open && (
        <div className="template-dropdown-menu">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              className="template-dropdown-item"
              onClick={() => handleApply(t.id)}
              title={t.description}
            >
              <span className="template-item-name">{t.name}</span>
              <span className="template-item-desc">{t.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
