import { describe, it, expect, vi, beforeEach } from "vitest";
import { exploreRepository } from "./explore.js";
import * as discovery from "./discovery.js";
import * as verification from "./verification.js";
import * as indexer from "../../explorer/indexer.js";

vi.mock("./discovery.js");
vi.mock("./verification.js");
vi.mock("../../explorer/indexer.js");

describe("exploreRepository raw-answer fallback", () => {
  const mockInput = {
    repository_root: "/tmp/repo",
    question: "What does this project do?",
    model: "qwen3.5:4b",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (indexer.indexRepository as any).mockReturnValue({
      commit_hash: "abc123def",
      symbols: [],
      calls: [],
      references: [],
    });
  });

  it("should return raw hypotheses as answer when no claims are materializable", async () => {
    (discovery.discoverEvidence as any).mockResolvedValue({
      commit_hash: "abc123def",
      model_calls: 1,
      discovery: {
        hypotheses: [
          { hypothesis: "Project is a server", required_evidence: [] },
          { hypothesis: "Project uses TypeScript", required_evidence: [] },
        ],
        retrieval_gaps: [],
      },
    });

    // In explore.ts, claims are only created if evidence is materialized.
    // Since we provide empty required_evidence, no claims will be created.

    const result = await exploreRepository(mockInput as any);

    expect(result.mode).toBe("raw");
    expect(result.answer_to_user).toBe("I could not materialize evidence for a supported answer.");
    expect(result.warnings).toContain("No materializable evidence found for the hypotheses.");
  });

  it("should return raw hypotheses when synthesis finds no supported claims", async () => {
    (discovery.discoverEvidence as any).mockResolvedValue({
      commit_hash: "abc123def",
      model_calls: 1,
      discovery: {
        hypotheses: [
          { 
            hypothesis: "The project implements an MCP server", 
            required_evidence: [{ kind: "symbol", target: "Server", reason: "check" }] 
          },
        ],
        retrieval_gaps: [],
      },
    });

    // Mock evidenceForDiscovery implicitly by making indexRepository return symbols
    (indexer.indexRepository as any).mockReturnValue({
      commit_hash: "abc123def",
      symbols: [{ id: "symbol:Server", name: "Server", qualified_name: "Server", file: "index.ts", range: { start: { byte: 0 }, end: { byte: 10 } } }],
      calls: [],
      references: [],
    });

    (verification.verifyClaims as any).mockResolvedValue({
      commit_hash: "abc123def",
      model_calls: 1,
      results: [
        {
          id: "hypothesis-1",
          claim: "The project implements an MCP server",
          verification_status: "INSUFFICIENT",
          rationale: "Not enough proof",
          resolution_quality: "exact",
          evidence: [],
        },
      ],
    });

    const result = await exploreRepository(mockInput as any);

    expect(result.mode).toBe("raw");
    expect(result.answer_to_user).toBe("1. The project implements an MCP server");
    expect(result.warnings).toContain("No claims were fully verified; falling back to raw discovery hypotheses.");
  });

  it("should return verified answer when synthesis succeeds", async () => {
    (discovery.discoverEvidence as any).mockResolvedValue({
      commit_hash: "abc123def",
      model_calls: 1,
      discovery: {
        hypotheses: [
          { 
            hypothesis: "The project implements an MCP server", 
            required_evidence: [{ kind: "symbol", target: "Server", reason: "check" }] 
          },
        ],
        retrieval_gaps: [],
      },
    });

    (indexer.indexRepository as any).mockReturnValue({
      commit_hash: "abc123def",
      symbols: [{ id: "symbol:Server", name: "Server", qualified_name: "Server", file: "index.ts", range: { start: { byte: 0 }, end: { byte: 10 } } }],
      calls: [],
      references: [],
    });

    (verification.verifyClaims as any).mockResolvedValue({
      commit_hash: "abc123def",
      model_calls: 1,
      results: [
        {
          id: "hypothesis-1",
          claim: "The project implements an MCP server",
          verification_status: "SUPPORTED",
          rationale: "Proven",
          resolution_quality: "exact",
          evidence: [{ evidence_kind: "symbol", symbol_id: "symbol:Server", excerpt: "class Server {}", commit_hash: "abc123def", resolution_quality: "exact", file: "index.ts" }],
        },
      ],
    });

    const result = await exploreRepository(mockInput as any);

    expect(result.mode).toBe("verified");
    expect(result.answer_to_user).toContain("- The project implements an MCP server");
  });
});
