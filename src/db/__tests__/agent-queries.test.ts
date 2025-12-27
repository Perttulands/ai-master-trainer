import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AgentDefinition } from '../../types/agent';
import * as queries from '../queries';
import { getDatabase, saveDatabase } from '../index';

// The database is already mocked in test/setup.ts

// Helper to create a test agent
function createTestAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: 'agent-123',
    name: 'Test Agent',
    description: 'A test agent',
    version: 1,
    systemPrompt: 'You are a helpful assistant.',
    tools: [],
    flow: [
      {
        id: 'start-1',
        type: 'start',
        name: 'Start',
        config: {},
        position: { x: 0, y: 0 },
        connections: { next: 'output-1' },
      },
      {
        id: 'output-1',
        type: 'output',
        name: 'Output',
        config: {},
        position: { x: 200, y: 0 },
        connections: {},
      },
    ],
    memory: { type: 'buffer', config: { maxMessages: 10 } },
    parameters: { model: 'claude-sonnet', temperature: 0.7, maxTokens: 1024 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('Agent Queries', () => {
  let mockDb: ReturnType<typeof getDatabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = getDatabase();
  });

  describe('createAgent', () => {
    it('should insert agent into database with JSON serialized fields', () => {
      const agent = createTestAgent();
      const lineageId = 'lineage-123';

      // Execute
      const result = queries.createAgent(agent, lineageId);

      // Verify
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agent_definitions'),
        expect.arrayContaining([
          agent.id,
          lineageId,
          agent.version,
          agent.name,
          agent.description,
          agent.systemPrompt,
          JSON.stringify(agent.tools),
          JSON.stringify(agent.flow),
          JSON.stringify(agent.memory),
          JSON.stringify(agent.parameters),
        ])
      );
      expect(saveDatabase).toHaveBeenCalled();
      expect(result).toEqual(agent);
    });

    it('should generate a new id if agent has no id', () => {
      const agent = createTestAgent({ id: undefined as unknown as string });
      const lineageId = 'lineage-123';

      const result = queries.createAgent(agent, lineageId);

      expect(result.id).toBeDefined();
      expect(result.id).not.toBe('');
    });
  });

  describe('getAgentByLineage', () => {
    it('should return agent when found', () => {
      const agent = createTestAgent();
      const lineageId = 'lineage-123';

      // Mock database response
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        {
          columns: ['id', 'lineage_id', 'version', 'name', 'description', 'system_prompt', 'tools', 'flow', 'memory_config', 'parameters', 'created_at', 'updated_at'],
          values: [[
            agent.id,
            lineageId,
            agent.version,
            agent.name,
            agent.description,
            agent.systemPrompt,
            JSON.stringify(agent.tools),
            JSON.stringify(agent.flow),
            JSON.stringify(agent.memory),
            JSON.stringify(agent.parameters),
            agent.createdAt,
            agent.updatedAt,
          ]],
        },
      ]);

      const result = queries.getAgentByLineage(lineageId);

      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [lineageId]
      );
      expect(result).toEqual(agent);
    });

    it('should return null when no agent found', () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);

      const result = queries.getAgentByLineage('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getLatestAgentVersion', () => {
    it('should return highest version agent', () => {
      const agent = createTestAgent({ version: 3 });
      const lineageId = 'lineage-123';

      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        {
          columns: [],
          values: [[
            agent.id,
            lineageId,
            agent.version,
            agent.name,
            agent.description,
            agent.systemPrompt,
            JSON.stringify(agent.tools),
            JSON.stringify(agent.flow),
            JSON.stringify(agent.memory),
            JSON.stringify(agent.parameters),
            agent.createdAt,
            agent.updatedAt,
          ]],
        },
      ]);

      const result = queries.getLatestAgentVersion(lineageId);

      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY version DESC'),
        [lineageId]
      );
      expect(result?.version).toBe(3);
    });

    it('should return null when no agents exist', () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);

      const result = queries.getLatestAgentVersion('empty-lineage');

      expect(result).toBeNull();
    });
  });

  describe('getAgentHistory', () => {
    it('should return all versions ordered by version descending', () => {
      const lineageId = 'lineage-123';
      const agent1 = createTestAgent({ id: 'agent-1', version: 1 });
      const agent2 = createTestAgent({ id: 'agent-2', version: 2 });

      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([
        {
          columns: [],
          values: [
            [agent2.id, lineageId, 2, agent2.name, agent2.description, agent2.systemPrompt, '[]', '[]', '{}', '{}', agent2.createdAt, agent2.updatedAt],
            [agent1.id, lineageId, 1, agent1.name, agent1.description, agent1.systemPrompt, '[]', '[]', '{}', '{}', agent1.createdAt, agent1.updatedAt],
          ],
        },
      ]);

      const result = queries.getAgentHistory(lineageId);

      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY version DESC'),
        [lineageId]
      );
      expect(result).toHaveLength(2);
      expect(result[0].version).toBe(2);
      expect(result[1].version).toBe(1);
    });

    it('should return empty array when no history', () => {
      (mockDb.exec as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);

      const result = queries.getAgentHistory('no-history');

      expect(result).toEqual([]);
    });
  });

  describe('updateAgent', () => {
    it('should update agent fields', () => {
      const agentId = 'agent-123';
      const updates = {
        name: 'Updated Agent',
        systemPrompt: 'Updated prompt',
      };

      queries.updateAgent(agentId, updates);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE agent_definitions'),
        expect.arrayContaining([updates.name, updates.systemPrompt, agentId])
      );
      expect(saveDatabase).toHaveBeenCalled();
    });

    it('should serialize JSON fields on update', () => {
      const agentId = 'agent-123';
      const updates = {
        tools: [{ id: 'tool-1', name: 'search', description: 'Search tool', type: 'builtin' as const, config: {}, parameters: [] }],
      };

      queries.updateAgent(agentId, updates);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE agent_definitions'),
        expect.arrayContaining([JSON.stringify(updates.tools)])
      );
    });
  });

  describe('deleteAgent', () => {
    it('should delete agent by id', () => {
      const agentId = 'agent-123';

      queries.deleteAgent(agentId);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM agent_definitions'),
        [agentId]
      );
      expect(saveDatabase).toHaveBeenCalled();
    });
  });
});
