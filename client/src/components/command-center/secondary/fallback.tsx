import type { ReactNode } from 'react';
import type { CommandCenterSlot } from '@nohm/shared';
import { ClaudeIcon, OpenAiIcon } from '../../../sections/ai/ToolIcons';

export function AiToolMark({ accent, className }: Readonly<{ accent: CommandCenterSlot['accent']; className: string }>) {
  let Icon: typeof ClaudeIcon | undefined;
  if (accent === 'claude') Icon = ClaudeIcon;
  else if (accent === 'codex') Icon = OpenAiIcon;
  if (!Icon) return null;
  const color = accent === 'codex' ? 'var(--color-openai-mark)' : 'var(--color-claude)';
  return <Icon className={className} style={{ color }} />;
}

export function FallbackSecondary({ slot }: Readonly<{ slot: CommandCenterSlot }>): ReactNode {
  const toolMark = <AiToolMark accent={slot.accent} className="h-10 w-10 shrink-0" />;
  return <div className={slot.accent ? 'command-secondary-ai mt-4' : 'mt-4'}>
    {toolMark}
    <div><p className="text-sm font-semibold text-ink">{slot.title}</p><p className="mt-1 text-sm text-ink-muted">{slot.detail}</p></div>
  </div>;
}
