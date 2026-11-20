import { Rpc } from "@opencode/plugin/rpc";

export const Links = Rpc.define({
  id: "local.links",
  methods: {
    list: {
      input: {
        type: "object", properties: { sessionID: { type: "string", minLength: 1 } },
        required: ["sessionID"], additionalProperties: false,
      },
      output: {
        type: "array",
        items: {
          type: "object",
          properties: {
            url: { type: "string" }, label: { type: "string", minLength: 1, maxLength: 30 },
            description: { type: "string", minLength: 1, maxLength: 1000 },
          },
          required: ["url", "label"], additionalProperties: false,
        },
      },
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
