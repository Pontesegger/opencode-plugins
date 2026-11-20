import { Plugin } from "@opencode/plugin";
import { Links } from "./rpc.ts";
import { createLinks } from "./links.mjs";

export default Plugin.define({
  id: "local.links",
  async setup(context) {
    const links = createLinks(context.storage);
    const rpc = await context.rpc.register(Links, {
      list: async (input) => links.list((input as { sessionID: string }).sessionID),
    });
    const tools = await context.tool.transform((editor) => {
      editor.namespace({ name: "links", description: "Post useful links to the current session's sidebar." });
      editor.add({
        name: "post",
        description: "Post a useful HTTP(S) link to the current session's Links sidebar. Use a very short label (at most 30 characters) and an optional longer description for the hover card. Reposting a URL updates its label and any supplied description. Links persist with this session; do not post secrets or signed/private access URLs.",
        input: {
          type: "object",
          properties: {
            url: { type: "string", description: "An absolute HTTP(S) URL." },
            label: { type: "string", minLength: 1, maxLength: 30, description: "A short plain-text description, at most 30 characters." },
            description: { type: "string", minLength: 1, maxLength: 1000, description: "Optional detailed plain-text context shown when hovering over the link (at most 1000 characters)." },
          },
          required: ["url", "label"], additionalProperties: false,
        },
        options: { namespace: "links", codemode: false },
        execute: async (input, call) => {
          const link = await links.post(call.sessionID, input);
          // A missed live notification must not turn a successful durable write into a failed tool call.
          try { await rpc.events.emit("updated", { sessionID: call.sessionID }); } catch {}
          return { content: `Posted to Links: ${link.label}` };
        },
      });
    });
    const hook = await context.session.hook("context", (event) => {
      event.system.push({ type: "text", text: "When you find a particularly useful link for the user (for example documentation, an issue, a pull request, or a preview), proactively post it with links_post to the current session's Links sidebar. Keep the label at most 30 characters; include a longer description when useful to explain the link in its hover card. Be selective; do not post every URL or URLs containing secrets/access tokens." });
    });
    return async () => {
      await hook.dispose();
      await tools.dispose();
      await rpc.dispose();
    };
  },
});
