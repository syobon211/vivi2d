import { BUILTIN_TEMPLATES } from "@vivi2d/core/templates";
import type { Template, TemplateCategory } from "@vivi2d/core/types";
import {
  applyTemplate as applyTemplateCommand,
  type TemplateApplyResult,
} from "@vivi2d/editor-core/template-command";
import { create } from "zustand";
import { useI18nStore } from "@/lib/i18n";
import { localizeTemplateForLocale } from "@/lib/template-localization";
import { withStandardMiddleware } from "./_middleware";
import { mutateProject } from "./projectMutator";

interface TemplateActions {
  applyTemplate: (templateId: string) => TemplateApplyResult | null;

  getTemplatesByCategory: (category: TemplateCategory) => Template[];
}

export const useTemplateStore = create<TemplateActions>()(
  withStandardMiddleware<TemplateActions>(
    () => ({
      applyTemplate: (templateId) => {
        const template = BUILTIN_TEMPLATES.find((t) => t.id === templateId);
        if (!template) return null;
        const localizedTemplate = localizeTemplateForLocale(
          template,
          useI18nStore.getState().locale,
        );

        let result: TemplateApplyResult = {};
        mutateProject((project) => {
          result = applyTemplateCommand(project, localizedTemplate);
        });
        return result;
      },

      getTemplatesByCategory: (category) =>
        BUILTIN_TEMPLATES.filter((t) => t.category === category).map((template) =>
          localizeTemplateForLocale(template, useI18nStore.getState().locale),
        ),
    }),
    { name: "TemplateStore", persistEnabled: false },
  ),
);
