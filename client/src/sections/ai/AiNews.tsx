import type { AiNewsData, AiNewsProvider } from '@nohm/shared';
import { useWidget } from '../../useWidget';
import { WidgetCard } from '../../components/WidgetCard';
import { relativeTime } from '../../lib/time';
import { ClaudeIcon, OpenAiIcon } from './ToolIcons';
import type { ToolIconProps } from './ToolIcons';

// Ordered to align with AI_TOOLS (Claude Code left, Codex right) so each news column sits
// under its matching usage card: Anthropic/Claude left, OpenAI/Codex right.
const GROUPS: { provider: AiNewsProvider; label: string; color: string; icon: React.ComponentType<ToolIconProps> }[] = [
  { provider: 'anthropic', label: 'Anthropic', color: 'var(--color-claude)', icon: ClaudeIcon },
  { provider: 'openai', label: 'OpenAI', color: 'var(--color-openai-mark)', icon: OpenAiIcon },
];

function NewsGroup({
  label,
  color,
  icon: Icon,
  items,
  scrollable,
}: Readonly<{
  label: string;
  color: string;
  icon: React.ComponentType<ToolIconProps>;
  items: AiNewsData['items'];
  scrollable?: boolean;
}>) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
        {label}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-ink-faint">No recent stories.</p>
      ) : (
        <ul className={`space-y-1.5 text-sm ${scrollable ? 'h-[19rem] overflow-y-auto pr-1' : ''}`}>
          {items.map((item) => (
            <li key={item.url} className="leading-tight">
              <a href={item.url} target="_blank" rel="noreferrer" className="font-medium text-ink hover:underline">
                {item.title}
              </a>
              <div className="text-xs text-ink-faint">
                {item.source} · {relativeTime(item.publishedAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AiNews({ scrollable }: Readonly<{ scrollable?: boolean }> = {}) {
  const { envelope, offline } = useWidget<AiNewsData>('ai-news');

  return (
    <WidgetCard title="AI news" envelope={envelope} offline={offline}>
      {(data) => (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <NewsGroup
              key={group.provider}
              label={group.label}
              color={group.color}
              icon={group.icon}
              items={data.items.filter((item) => item.provider === group.provider)}
              scrollable={scrollable}
            />
          ))}
        </div>
      )}
    </WidgetCard>
  );
}
