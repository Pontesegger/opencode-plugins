import { Rpc } from "@opencode/plugin/rpc";

const sessionInput = {
  type: "object", properties: { sessionID: { type: "string" } },
  required: ["sessionID"], additionalProperties: false,
} as const;

export const ContextInspector = Rpc.define({
  id: "local.context-inspector",
  methods: {
    summary: {
      input: sessionInput,
      output: { type: ["object", "null"] },
    },
    details: {
      input: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          revision: { type: "string" },
          category: { type: "string", enum: ["prompt", "rules", "tools", "skills", "mcp"] },
        },
        required: ["sessionID", "revision", "category"], additionalProperties: false,
      },
      output: { type: ["object", "null"] },
    },
  },
  events: {
    updated: {
      schema: {
        type: "object", properties: { sessionID: { type: "string" } },
        required: ["sessionID"], additionalProperties: false,
      },
    },
  },
});
