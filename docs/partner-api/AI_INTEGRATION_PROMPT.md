# Integrating with an AI coding assistant

The prompt that used to live here has been replaced by the **integration
brief**: the complete contract a developer or AI coding assistant needs, with
the rules the integration must follow, every call with examples, error
handling, and a done-checklist.

- **Partners:** get it from the app's **Connect Your System** page — it comes
  with your organization and network IDs already filled in. Copy it or
  download it as Markdown.
- **Template** (placeholders instead of IDs): [INTEGRATION_BRIEF.md](INTEGRATION_BRIEF.md).

## How to use it

1. Paste the brief into your assistant (Claude Code, Cursor, Copilot,
   ChatGPT) or add the file to your project.
2. Add a sentence or two about your system, e.g. *"Our members are in CiviCRM;
   programs are CiviCRM memberships; signups come through a Drupal webform."*
3. Ask for one piece at a time: the person push on save, then participation,
   then the consent block in the signup form, then referrals.

The brief never contains your API key. Keep the key in a secret store; the
generated code should read it from an environment variable (`NEXUS_API_KEY`).

For a worked example to give the assistant alongside the brief — the first
pilot partner's open-source Drupal/CiviCRM integration and what it learned —
see [EXAMPLE_MAKEHAVEN.md](EXAMPLE_MAKEHAVEN.md).

To self-test an integration against the sandbox, see
[AI_AGENT_ACCEPTANCE_TEST.md](AI_AGENT_ACCEPTANCE_TEST.md) and
[TRY_IT.md](TRY_IT.md).
