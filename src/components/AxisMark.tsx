export default function AxisMark({
  size = 48,
  word = false,
}: {
  size?: number;
  word?: boolean;
}) {
  return (
    <span className="axis-mark">
      <img src="/branding/axis-logo.png" width={size} height={size} alt="" />
      {word ? <span className="axis-word">AXIS</span> : null}
    </span>
  );
}
