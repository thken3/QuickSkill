# fav

A Claude Code mod that puts your favorite plugins on the footer line, next to "auto mode", as buttons you click to turn them on and off.

```
⏵⏵ auto mode on (shift+tab to cycle)  ● caveman  ● superpowers  ○ ponytail
```

- `●` is on, `○` is off. Click a button to flip it.
- Plugins are turned on and off with `claude plugin enable` / `disable` (user scope). Claude is told about the change with your next message, so it takes effect in the current session; the plugin's skills and hooks follow at the next session start (or run `/reload-plugins`).
- `caveman` is shown when your `~/.claude/CLAUDE.md` tells Claude to use the caveman skill. When it is off, the mod leaves that rule out of what Claude reads. The file itself is not changed.

## Commands

- `/fav` opens a menu to choose which favorites the footer shows.
- `/fav <name> [on|off]` turns one on or off without clicking.

## Install

At the prompt of a terminal session:

```
/plugin install fav --marketplace thken3/QuickSkill
```

Answer `y` to add the marketplace, then choose a scope (user scope loads it in every session).

From a shell:

```
claude plugin install fav --marketplace thken3/QuickSkill
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `thken3/QuickSkill`, then Add plugin.

## License

MIT, see [LICENSE](LICENSE).
