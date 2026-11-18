# Main blog — Agent Automations memory

Scheduled posts use **Blog Agent** with `agent_type=automation`. Extra rules live in:

- **DB:** `blog_agent_guidelines.id = 4` (blog database)
- **Admin:** Blog → Agent Automations → **Agent memory (automations)**

When you change automation behavior (slug, SEO, categories, titles), update **agent memory** in admin so every cron run follows the same rules.

Default seed text: `src/modules/agents/blog/blogAgentAutomationMemory.js`

Also loaded into automation prompts in `agentAutomations.service.js` and into the agent system prompt when the thread is an automation run.
