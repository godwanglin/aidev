export default function Status({ value }: { value: string }) {
  const kind = value.startsWith("2") ? "ok" : value.startsWith("429") ? "bad" : "warn";
  return <span className={`badge ${kind}`}>{value}</span>;
}
