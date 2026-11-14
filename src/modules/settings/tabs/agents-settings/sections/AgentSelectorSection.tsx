import { LLMProviderLogo, PillBar, Pill } from '@/shared/ui';
import type { AgentContextByProvider, AgentProvider } from '@/shared/types';

type AgentSelectorSectionProps = {
  agents: AgentProvider[];
  selectedAgent: AgentProvider;
  onSelectAgent: (agent: AgentProvider) => void;
  agentContextById: AgentContextByProvider;
};

const AGENT_NAMES: Record<AgentProvider, string> = {
  gemini: 'Gemini',
  claude: 'Claude',
  cursor: 'Cursor',
  codex: 'Codex',
  opencode: 'OpenCode',
  workbuddy: 'WorkBuddy',
  'deepseek-harness': 'DeepSeek Harness',
};

/** Rendered by AgentsSettingsTab to pick which agent provider the tab is configuring. */
export default function AgentSelectorSection({
  agents,
  selectedAgent,
  onSelectAgent,
  agentContextById,
}: AgentSelectorSectionProps) {
  return (
    <div className="flex-shrink-0 border-b border-border px-3 py-2 md:px-4 md:py-3">
      <PillBar className="flex w-full overflow-x-auto">
        {agents.map((agent) => {
          const dotColor =
            agent === 'claude' ? 'bg-primary' :
            agent === 'cursor' ? 'bg-primary' :
            agent === 'opencode' ? 'bg-muted' : 'bg-foreground/60';

          return (
            <Pill
              key={agent}
              isActive={selectedAgent === agent}
              onClick={() => onSelectAgent(agent)}
              className="shrink-0 justify-center"
            >
              <LLMProviderLogo provider={agent} className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{AGENT_NAMES[agent]}</span>
              {agentContextById[agent].authStatus.authenticated && (
                <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotColor}`} />
              )}
            </Pill>
          );
        })}
      </PillBar>
    </div>
  );
}
