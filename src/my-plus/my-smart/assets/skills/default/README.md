# default skill

The built-in "Smart + Skills" rules.

- `SKILL.md` — the single source of truth: YAML frontmatter (`name`, `description`,
  `triggers`) plus the working rules in the body. Edit it here; the change is picked
  up on the next Smart launch.
- On launch the host reads `SKILL.md`, strips the frontmatter (`extractSkillBody`),
  and writes the body to `.f1/smart-rules.md` for the CLI to read.

Keep the load-bearing phrases listed in `RULE_INVARIANTS` (`my-smart/core/skill.ts`)
verbatim — `src/__test__/smart-rules.test.ts` fails if any go missing.
