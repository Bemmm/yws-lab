/** Geometry for the per-competency mini history: common 0-10 axis, only assessed stages are plotted. */
export interface SparkPoint {
  index: number;
  value: number;
  x: number;
  y: number;
}

export interface SparkGeometry {
  width: number;
  height: number;
  points: SparkPoint[];
  /** "x,y x,y …" for a polyline through the assessed points (empty when fewer than two). */
  line: string;
  /** y positions of the 0, 5 and 10 gridlines. */
  grid: { value: number; y: number }[];
}

export function sparkGeometry(
  values: readonly (number | null)[],
  width = 120,
  height = 36,
  pad = 4,
): SparkGeometry {
  const n = values.length;
  const x = (i: number) => (n <= 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (n - 1));
  const y = (v: number) => height - pad - (Math.min(10, Math.max(0, v)) * (height - 2 * pad)) / 10;
  const points: SparkPoint[] = [];
  values.forEach((v, index) => {
    if (v !== null) points.push({ index, value: v, x: round(x(index)), y: round(y(v)) });
  });
  return {
    width,
    height,
    points,
    line: points.length >= 2 ? points.map((p) => `${p.x},${p.y}`).join(" ") : "",
    grid: [0, 5, 10].map((value) => ({ value, y: round(y(value)) })),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
