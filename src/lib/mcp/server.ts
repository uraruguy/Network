import "server-only";
import { createMcpHandler } from "mcp-handler";
import { registerMcpTools } from "@/lib/ai/tools";
import { toolCtxFromAuth } from "./auth";

/**
 * The MCP server: the same operations as the in-app assistant (src/lib/ai/tools), served over
 * stateless Streamable HTTP by mcp-handler. Each tool call resolves its caller from the verified
 * bearer token (`ctx.http.authInfo`), so one handler serves every token and OAuth client.
 */

export const MCP_INSTRUCTIONS = `This server is the user's personal relationship network ("The Network"): people, notes about meetings/calls/messages, follow-up reminders, categories, activities and tags.

- Find people with search_people (free text + filters such as activities, city, categories, lastContactBefore) or people_by_place; open one with get_person.
- "What did we discuss last time with X?" → list_notes for that person (full: true for the whole text).
- Topics across notes → search_notes. Notes mix Slovenian and English: include both language variants of key terms joined with OR.
- Mention people by name; links to the app are /people/<id> on the user's Network URL.
- Writing (add_note, create_person, update_person, create_followup, complete_followup) needs a connection with Read & write access and only when the user asks. Nothing can be deleted through this server.`;

export const mcpHandler = createMcpHandler((server) => registerMcpTools(server, (ctx) => toolCtxFromAuth(ctx.http?.authInfo)), {
  serverInfo: { name: "the-network", version: "2.0.0" },
  instructions: MCP_INSTRUCTIONS,
});
