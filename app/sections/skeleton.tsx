function Sk({ className }: { className?: string }) {
  return <span className={'sk ' + (className ?? '')} aria-hidden="true" />;
}

export function SkeletonCards({ n = 6 }: { n?: number }) {
  return (
    <output className="cards">
      <span className="sr-only">불러오는 중…</span>
      {Array.from({ length: n }, (_, i) => (
        <article className="card pad" key={i}>
          <div className="between">
            <Sk className="sk-dot" />
            <Sk className="sk-badge" />
          </div>
          <Sk className="sk-line lg" />
          <Sk className="sk-line" />
          <Sk className="sk-line sm" />
          <Sk className="sk-btn" />
        </article>
      ))}
    </output>
  );
}

export function SkeletonRows({ n = 6 }: { n?: number }) {
  return (
    <output className="sk-status">
      <span className="sr-only">불러오는 중…</span>
      {Array.from({ length: n }, (_, i) => (
        <div className="sk-row" key={i}>
          <Sk className="sk-dot" />
          <div className="sk-row-lines">
            <Sk className="sk-line lg" />
            <Sk className="sk-line sm" />
          </div>
        </div>
      ))}
    </output>
  );
}

export function SkeletonDetail() {
  return (
    <output className="sk-status">
      <span className="sr-only">불러오는 중…</span>
      <Sk className="sk-badge" />
      <Sk className="sk-line xl" />
      <Sk className="sk-line" />
      <div className="sk-grid">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i}>
            <Sk className="sk-line sm" />
            <Sk className="sk-line" />
          </div>
        ))}
      </div>
      <Sk className="sk-btn" />
    </output>
  );
}
