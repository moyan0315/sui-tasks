export function Skeleton() {
  return (
    <div className="full-skeleton" role="status" aria-label="メモを読み込み中">
      <div className="skeleton-header skeleton-bar" />
      <div className="skeleton-title skeleton-bar" />
      <div className="skeleton-composer skeleton-bar" />
      <div className="skeleton-tabs skeleton-bar" />
      {[0, 1, 2].map((i) => (
        <div className="skeleton-row skeleton-bar" key={i} />
      ))}
      <span className="sr-only">読み込み中。メモの入力はできます。</span>
    </div>
  );
}
