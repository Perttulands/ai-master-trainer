import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.stubEnv("VITE_ORCHESTRATION_MODE", "backend");
vi.stubEnv("VITE_ORCHESTRATION_API_BASE", "http://localhost:8000");

describe("orchestration api client", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it("patches session fields via backend", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        session: {
          id: "ses_1",
          name: "Updated Session",
          need: "Need",
          constraints: null,
          inputPrompt: "Prompt",
          initialAgentCount: 4,
          trainerMessages: [],
          createdAt: 1,
          updatedAt: 2,
        },
      }),
    });

    const { updateBackendSession } = await import("../orchestration");
    const session = await updateBackendSession("ses_1", { inputPrompt: "Prompt" });

    expect(session.id).toBe("ses_1");
    expect(session.inputPrompt).toBe("Prompt");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/sessions/ses_1",
      expect.objectContaining({
        method: "PATCH",
      })
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body).toEqual({ inputPrompt: "Prompt" });
  });

  it("loads backend session history", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        session: {
          id: "ses_1",
          name: "Session",
          need: "Need",
          constraints: null,
          inputPrompt: null,
          initialAgentCount: 1,
          trainerMessages: [],
          createdAt: 1,
          updatedAt: 2,
        },
        histories: [
          {
            lineage: {
              id: "lin_1",
              sessionId: "ses_1",
              label: "A",
              strategyTag: "Concise",
              isLocked: false,
              directiveSticky: [],
              directiveOneshot: [],
              createdAt: 1,
            },
            artifacts: [
              {
                id: "art_1",
                lineageId: "lin_1",
                cycle: 1,
                content: "output",
                metadata: {},
                createdAt: 1,
                evaluation: {
                  id: "evl_1",
                  artifactId: "art_1",
                  score: 8,
                  comment: "good",
                  createdAt: 1,
                },
              },
            ],
          },
        ],
      }),
    });

    const { getBackendSessionHistory } = await import("../orchestration");
    const history = await getBackendSessionHistory("ses_1");

    expect(history.session.id).toBe("ses_1");
    expect(history.histories).toHaveLength(1);
    expect(history.histories[0].artifacts[0].evaluation?.score).toBe(8);
  });

  it("adds lineage through backend endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        session: {
          id: "ses_1",
          name: "Session",
          need: "Need",
          constraints: null,
          inputPrompt: null,
          initialAgentCount: 2,
          trainerMessages: [],
          createdAt: 1,
          updatedAt: 2,
        },
        lineages: [],
      }),
    });

    const { addBackendLineage } = await import("../orchestration");
    await addBackendLineage("ses_1", { label: "B" });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/sessions/ses_1/lineages",
      expect.objectContaining({
        method: "POST",
      })
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body).toEqual({ label: "B" });
  });

  it("updates directives through backend endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ lineage: { id: "lin_1" } }),
    });

    const { updateBackendLineageDirectives } = await import("../orchestration");
    await updateBackendLineageDirectives("ses_1", "A", {
      directiveSticky: ["Use bullets"],
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/sessions/ses_1/lineages/A/directives",
      expect.objectContaining({
        method: "POST",
      })
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body).toEqual({ directiveSticky: ["Use bullets"] });
  });

  it("deletes sessions through backend endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ deleted: true }),
    });

    const { deleteBackendSession } = await import("../orchestration");
    await deleteBackendSession("ses_1");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/sessions/ses_1",
      expect.objectContaining({
        method: "DELETE",
      })
    );
  });
});
