import { Card } from "@/components/ui/card";
import type { KeywordFrequency, TextStats } from "@/lib/text/types";

type StatsPanelProps = {
  stats: TextStats;
  keywords?: KeywordFrequency[];
};

export function StatsPanel({ stats, keywords = [] }: StatsPanelProps) {
  const metrics = [
    { label: "Words", value: stats.words.toLocaleString() },
    { label: "Characters", value: stats.characters.toLocaleString() },
    { label: "No spaces", value: stats.charactersNoSpaces.toLocaleString() },
    { label: "Sentences", value: stats.sentences.toLocaleString() },
    { label: "Paragraphs", value: stats.paragraphs.toLocaleString() },
    { label: "Lines", value: stats.lines.toLocaleString() },
    {
      label: "Reading time",
      value: stats.readingTimeMinutes === 0 ? "< 1 min" : `~${stats.readingTimeMinutes} min`,
    },
    {
      label: "Speaking time",
      value: stats.speakingTimeMinutes === 0 ? "< 1 min" : `~${stats.speakingTimeMinutes} min`,
    },
  ];

  return (
    <div className="stats-panel-wrapper space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map((metric) => (
          <Card key={metric.label} className="p-3 text-center">
            <span className="text-2xl font-bold block text-foreground">{metric.value}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              {metric.label}
            </span>
          </Card>
        ))}
      </div>

      {keywords.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Top Keyword Density</h3>
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <span
                key={kw.word}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground"
              >
                <strong>{kw.word}</strong>
                <span className="opacity-70">({kw.count} · {kw.percentage}%)</span>
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
