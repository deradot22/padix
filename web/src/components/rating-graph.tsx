export function RatingGraph(props: { points: { date: string; rating: number }[] }) {
  const pts = props.points;
  if (pts.length < 2) return null;
  const ratings = pts.map((p) => p.rating);
  const minR = Math.min(...ratings);
  const maxR = Math.max(...ratings);
  const range = maxR - minR || 1;
  const pad = range * 0.1;
  const lo = Math.floor(minR - pad);
  const hi = Math.ceil(maxR + pad);
  const topPad = 32;
  const bottomPad = 32;
  const leftPad = 24;
  const rightPad = 24;
  const graphH = 180;
  const graphW = 360;
  const totalW = leftPad + graphW + rightPad;
  const totalH = topPad + graphH + bottomPad;
  const toY = (r: number) => topPad + graphH - ((r - lo) / (hi - lo)) * graphH;
  const toX = (i: number) => leftPad + (i / Math.max(1, pts.length - 1)) * graphW;

  // Десктоп: широкий viewBox (~4:1), при полной ширине высота ~200px
  const deskGraphH = 90;
  const deskTotalW = 520;
  const deskTotalH = 140;
  const deskToY = (r: number) => 28 + deskGraphH - ((r - lo) / (hi - lo)) * deskGraphH;
  const deskToX = (i: number) => 24 + (i / Math.max(1, pts.length - 1)) * (deskTotalW - 48);
  const mobileLabelOffset = 18;
  const getMobileLabelY = (i: number, y: number) => (i % 2 === 0 ? y - mobileLabelOffset : y + mobileLabelOffset);

  const linePoints = pts.map((p, i) => `${toX(i)},${toY(p.rating)}`).join(" ");
  const bottomY = topPad + graphH;
  const areaPath = `M ${toX(0)},${bottomY} L ${pts.map((p, i) => `${toX(i)},${toY(p.rating)}`).join(" L ")} L ${toX(pts.length - 1)},${bottomY} Z`;

  const deskBottomY = 28 + deskGraphH;
  const deskLinePoints = pts.map((p, i) => `${deskToX(i)},${deskToY(p.rating)}`).join(" ");
  const deskAreaPath = `M ${deskToX(0)},${deskBottomY} L ${pts.map((p, i) => `${deskToX(i)},${deskToY(p.rating)}`).join(" L ")} L ${deskToX(pts.length - 1)},${deskBottomY} Z`;
  const deskLabelOffset = 12;
  const deskGetLabelY = (i: number, y: number) => (i % 2 === 0 ? y - deskLabelOffset : y + deskLabelOffset);

  const GraphContent = () => (
    <>
      <defs>
        <linearGradient id="graphGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#graphGradient)" />
      <polyline
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={linePoints}
      />
      {pts.map((p, i) => {
        const y = toY(p.rating);
        const labelY = Math.max(topPad - 4, Math.min(totalH - bottomPad + 4, getMobileLabelY(i, y)));
        return (
          <g key={i}>
            <circle cx={toX(i)} cy={y} r="4" fill="var(--background)" stroke="var(--primary)" strokeWidth="2" />
            <text
              x={toX(i)}
              y={labelY}
              textAnchor="middle"
              className="font-semibold tabular-nums"
              style={{ fontSize: 12, fill: "var(--foreground)", stroke: "var(--background)", strokeWidth: 9, paintOrder: "stroke", strokeLinejoin: "round" }}
            >
              {p.rating}
            </text>
          </g>
        );
      })}
    </>
  );

  const DesktopContent = () => (
    <>
      <defs>
        <linearGradient id="graphGradientDesktop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={deskAreaPath} fill="url(#graphGradientDesktop)" />
      <polyline
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={deskLinePoints}
      />
      {pts.map((p, i) => {
        const y = deskToY(p.rating);
        const labelY = Math.max(20, Math.min(deskTotalH - 20, deskGetLabelY(i, y)));
        return (
          <g key={i}>
            <circle cx={deskToX(i)} cy={y} r="3" fill="var(--background)" stroke="var(--primary)" strokeWidth="1.5" />
            <text
              x={deskToX(i)}
              y={labelY}
              textAnchor="middle"
              className="font-semibold tabular-nums"
              style={{ fontSize: 10, fill: "var(--foreground)", stroke: "var(--background)", strokeWidth: 7, paintOrder: "stroke", strokeLinejoin: "round" }}
            >
              {p.rating}
            </text>
          </g>
        );
      })}
    </>
  );

  return (
    <>
      {/* Мобильная — полный размер */}
      <div className="overflow-x-auto md:hidden">
        <svg viewBox={`0 0 ${totalW} ${totalH}`} className="w-full min-h-[260px]" preserveAspectRatio="xMidYMid meet">
          <g className="text-primary">
            <GraphContent />
          </g>
        </svg>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{pts[0]?.date?.slice(0, 10)}</span>
          <span>{pts[pts.length - 1]?.date?.slice(0, 10)}</span>
        </div>
      </div>

      {/* Десктоп — на всю ширину, компактная высота (~200px при 800px ширине) */}
      <div className="hidden md:block overflow-x-auto w-full rounded-xl border border-border/40 bg-secondary/10 p-4">
        <svg
          viewBox={`0 0 ${deskTotalW} ${deskTotalH}`}
          className="w-full block"
          style={{ aspectRatio: `${deskTotalW}/${deskTotalH}` }}
          preserveAspectRatio="xMidYMid meet"
        >
          <g className="text-primary">
            <DesktopContent />
          </g>
        </svg>
        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
          <span>{pts[0]?.date?.slice(0, 10)}</span>
          <span>{pts[pts.length - 1]?.date?.slice(0, 10)}</span>
        </div>
      </div>
    </>
  );
}
