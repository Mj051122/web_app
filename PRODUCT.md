# Product

## Register

product

## Users

School administrators running a Philippine academic platform (Panthraa). They are mid-task: reviewing accounts, classes, enrollments, join requests, audit trails. They act with authority — approving, blocking, archiving — and need to do it without doubt or friction. Occasional check-ins from admin staff who are not deeply technical.

## Product Purpose

The Panthraa admin panel is the control center for a school platform used by students and faculty. It manages users (students, professors, admins), classes and schedules, enrollments, join requests, storage, notifications, and a full audit log of admin actions. Success looks like: an administrator can find any account or class, understand its state, and take the correct action with confidence — with every action recorded.

## Brand Personality

Authoritative, formal, exact. The panel speaks like a registrar's office: precise, calm, no noise, no fluff. Trust is the product; every element should reinforce that decisions here are recorded and reversible where intended. Not friendly-app, not cold-machine — formal and approachable.

## Anti-references

- Toy-looking "classroom app" aesthetics: bouncy pastels, cartoon icons, rounded-everything.
- Generic SaaS dashboard wallpaper: gradient hero cards, identical icon-card grids, tiny uppercase eyebrows over every section.
- Calendar apps that fake precision — fixed hourly rows that ignore real start/end times. A schedule must read like a real timetable, or it reads as untrustworthy.
- Anything that hides the consequences of an action behind vague wording (delete/approve/block must be unambiguous).

## Design Principles

1. **Precision is trust.** Schedules position by actual minutes, data shows exact counts, times are exact. Anywhere the UI rounds or fakes, it erodes confidence.
2. **Authority without menace.** Actions are available, visible, and confirmable — the interface never traps the admin into a mistake, and never hides what it did.
3. **State at a glance.** Blocked/active/archived/pending must be readable within one scan of any list.
4. **One vocabulary, everywhere.** The same button, form, badge, and icon language across every screen; no per-page invention.
5. **The tool disappears.** Density and speed for regular work; motion only to convey state, never decoration.

## Accessibility & Inclusion

- WCAG AA contrast everywhere (the Royal Indigo theme was chosen and darkened explicitly for this).
- `prefers-reduced-motion` respected; all animation has a non-moving fallback.
- Keyboard-usable controls; focus rings on the indigo ring token.
- Not color-blindness-hostile: status is never conveyed by color alone (labels on badges).
