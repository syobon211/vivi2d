import { useMemo } from "react";

export function TimelineRuler({ duration, fps }: { duration: number; fps: number }) {
  const marks = useMemo(() => {
    const result: { frame: number; label: string; major: boolean }[] = [];
    const step = fps;
    for (let f = 0; f < duration; f += step) {
      const sec = f / fps;
      result.push({
        frame: f,
        label: `${Math.floor(sec)}s`,
        major: true,
      });
    }
    return result;
  }, [duration, fps]);

  return (
    <div className="tl-ruler">
      {marks.map((m) => (
        <div
          key={m.frame}
          className="tl-ruler-mark"
          style={{ left: `${(m.frame / (duration - 1)) * 100}%` }}
        >
          <span className="tl-ruler-label">{m.label}</span>
        </div>
      ))}
    </div>
  );
}
