import { useEditorStore } from "@/stores/editorStore";
import { TimelineBody } from "./timeline/TimelineBody";
import { TimelineHeader } from "./timeline/TimelineHeader";

export function TimelinePanel() {
  const project = useEditorStore((s) => s.project);
  if (!project) return null;

  return (
    <div className="timeline-panel">
      <TimelineHeader />
      <TimelineBody />
    </div>
  );
}
