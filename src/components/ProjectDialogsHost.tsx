import { lazy, Suspense } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectDialogsStore } from "@/stores/projectDialogsStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { DialogLoadingFallback } from "./DialogLoadingFallback";

const DepthInspectorDialog = lazy(() =>
  import("./DepthInspectorDialog").then((m) => ({
    default: m.DepthInspectorDialog,
  })),
);
const ValidationDialog = lazy(() =>
  import("./ValidationDialog").then((m) => ({ default: m.ValidationDialog })),
);
const ManualPngSplitDialog = lazy(() =>
  import("./ManualPngSplitDialog").then((m) => ({
    default: m.ManualPngSplitDialog,
  })),
);

function DepthInspectorDialogHost({
  project,
  onClose,
}: {
  project: NonNullable<ReturnType<typeof useEditorStore.getState>["project"]>;
  onClose: () => void;
}) {
  const selectedLayerId = useSelectionStore((s) => s.selectedLayerId);
  return (
    <DepthInspectorDialog
      project={project}
      selectedLayerId={selectedLayerId}
      onClose={onClose}
    />
  );
}

export function ProjectDialogsHost() {
  const project = useEditorStore((s) => s.project);
  const showValidation = useProjectDialogsStore((s) => s.showValidationDialog);
  const showDepthInspector = useProjectDialogsStore(
    (s) => s.showDepthInspector,
  );
  const showManualPngSplit = useProjectDialogsStore((s) => s.showManualPngSplit);
  const closeValidationDialog = useProjectDialogsStore(
    (s) => s.closeValidationDialog,
  );
  const closeDepthInspectorDialog = useProjectDialogsStore(
    (s) => s.closeDepthInspector,
  );
  const closeManualPngSplit = useProjectDialogsStore(
    (s) => s.closeManualPngSplit,
  );

  return (
    <Suspense fallback={<DialogLoadingFallback />}>
      {showValidation && <ValidationDialog onClose={closeValidationDialog} />}
      {project && showDepthInspector && (
        <DepthInspectorDialogHost
          project={project}
          onClose={closeDepthInspectorDialog}
        />
      )}
      {project && showManualPngSplit && (
        <ManualPngSplitDialog onClose={closeManualPngSplit} />
      )}
    </Suspense>
  );
}
