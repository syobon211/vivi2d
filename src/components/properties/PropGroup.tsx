export function PropGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="prop-group">
      <div className="prop-label">{label}</div>
      <div className="prop-value">{children}</div>
    </div>
  );
}
