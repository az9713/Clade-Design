# Font Discipline for PPTX Exports

Companion to `layout-discipline.md`. The rail / cursor primitives in that
file catch geometric drift; this file catches the typography drift that
geometry can't see — variable-font traps, missing CJK slots, fake italic
on Han characters. These are the bugs that pass `verify_layout.py` and
still look wrong.

Read this when:

- The audit table has 🟡 entries about italic / em / font fallback.
- PowerPoint silently swaps to Calibri / Arial / Microsoft JhengHei /
  Georgia after you specified a different family.
- `unzip pptx | grep typeface` shows a face that isn't in your design system.

## Layer 1 — Font mapping in the export script

Walk each CSS class used by the source HTML and confirm the export
script maps it to the **same** font family.

⚠️ **Trap:** the visual category your eye reads is not always the
class's semantic category. Editorial decks routinely bind `.lead`,
`.callout`, or `.q-big` to a serif face, not the sans-serif you'd guess
from "lead". Open the HTML's CSS, read the `font-family` declaration
for each class, and copy the literal family name into the export's
font table.

Don't rely on visual intuition; rely on grep.

## Layer 2 — Font presence on the rendering machine

PowerPoint uses the OS font cache. If the family name in your XML isn't
installed, PowerPoint silently falls back. Check:

```bash
fc-list | grep -i "noto serif"            # Linux / WSL
mdfind "kMDItemFSName == '*NotoSerif*'"   # macOS
```

```powershell
# Windows (PowerShell)
Get-ChildItem -Path "$env:WINDIR\Fonts","$env:LOCALAPPDATA\Microsoft\Windows\Fonts" `
  -Filter "*NotoSerif*" -ErrorAction SilentlyContinue
```

Install missing families:

```bash
brew install --cask \
  font-noto-serif-tc \
  font-playfair-display \
  font-source-serif-4 \
  font-ibm-plex-mono
```

The `verify_layout.py` script can't see this — it only checks
geometry. A standalone font audit step is required.

## Layer 3 — Variable fonts vs. static families ← most common trap

Modern fonts often ship as a **single variable file** containing all
weights (`NotoSerifTC[wght].ttf`). Looks elegant, but PowerPoint Mac /
Windows have spotty support:

- macOS reports the variable font's family name as its **default static
  instance** — usually ExtraLight or Regular.
- PowerPoint asks the OS for "Noto Serif TC, weight 700"; the OS
  reports the family as `Noto Serif TC ExtraLight`; PowerPoint can't
  match → falls back to a system serif.

Diagnose:

```bash
ls -la ~/Library/Fonts/ | grep -i NotoSerif
```

| What you see                           | Verdict                                 |
| -------------------------------------- | --------------------------------------- |
| One `*[wght].ttf` file                 | Variable. PowerPoint may not match.     |
| Multiple `*-Regular.otf`, `*-Bold.otf` | Static family. Safe.                    |

Fix by using the static family equivalent:

| Don't use (variable)        | Use instead (static)              |
| --------------------------- | --------------------------------- |
| `Noto Serif TC` (variable)  | `Noto Serif CJK TC`               |
| `Source Serif 4` (variable) | `Source Serif Pro` / `Source Serif 4` static instances |
| `Inter` (variable)          | Per-weight `Inter Regular` / `Inter Bold` |

After fixing the export, re-run `extract_pptx.py` and confirm the
`font` field matches the static name.

## Layer 4 — PPTX XML's three-language slots

PowerPoint chooses a typeface per run by language script. Each run can
declare three:

| Attribute               | Used for                         |
| ----------------------- | -------------------------------- |
| `<a:latin typeface=…>`  | Latin script (a-z, A-Z, digits)  |
| `<a:ea typeface=…>`     | East Asian (CJK) — **Chinese / Japanese / Korean go here** |
| `<a:cs typeface=…>`     | Complex script (Arabic, Hebrew, Thai) |

Audit a file:

```bash
unzip -o /path/to/deck.pptx -d /tmp/audit
grep -h -oE 'typeface="[^"]+"' /tmp/audit/ppt/slides/slide*.xml | sort -u
```

Expected output: only the design-system fonts. If you see
`Microsoft JhengHei`, `Calibri`, `Arial`, `Georgia`, `Consolas`,
something has fallen back.

**Common defect:** export script writes `<a:latin>` only. Chinese runs
have no `<a:ea>` directive → PowerPoint picks the OS default
(Microsoft JhengHei on Windows, Hiragino Sans on Mac). Result: Chinese
characters in the wrong serif/sans family.

Fix: when adding a run with mixed-language content, set all three
attributes that apply.

```python
from pptx.oxml.ns import qn

def set_run_fonts(run, latin: str | None = None, ea: str | None = None, cs: str | None = None):
    rPr = run._r.get_or_add_rPr()
    if latin:
        el = rPr.find(qn('a:latin'))
        if el is None:
            el = rPr.makeelement(qn('a:latin'), {})
            rPr.append(el)
        el.set('typeface', latin)
    if ea:
        el = rPr.find(qn('a:ea'))
        if el is None:
            el = rPr.makeelement(qn('a:ea'), {})
            rPr.append(el)
        el.set('typeface', ea)
    if cs:
        el = rPr.find(qn('a:cs'))
        if el is None:
            el = rPr.makeelement(qn('a:cs'), {})
            rPr.append(el)
        el.set('typeface', cs)
```

PptxGenJS sets all three by default; raw XML injection or python-pptx
without explicit `ea` slot does not.

## Layer 5 — CJK + Latin italic interaction

🚨 **Never apply Latin italic + `italic=True` to runs containing CJK
characters.** The chain of failures:

1. `<a:latin>` slot has Playfair Display Italic (a Latin-only font).
2. The CJK characters in the run have no glyph in Playfair → PowerPoint
   substitutes a system CJK font.
3. The substituted CJK font is forced into `italic=True` → since no
   real CJK italic exists, PowerPoint synthesizes a slanted bitmap →
   characters look mechanically deformed.

**Rule:** italic only applies to Latin display copy. Indicate emphasis
on CJK runs via:

- color tone (`COLOR_INK_60` for muted, full ink for emphasis)
- weight contrast (Regular 400 vs. Bold 700)
- a CJK serif italic variant **only if one actually ships** — most
  don't

Practical implementation:

```python
def add_run_with_italic_safety(p, text, *, latin_face: str, cjk_face: str,
                               size_pt: int, italic: bool, **kwargs):
    """If italic=True but text contains CJK, drop italic on the CJK portion."""
    has_cjk = any(0x3400 <= ord(c) <= 0x9FFF or 0xF900 <= ord(c) <= 0xFAFF for c in text)
    r = p.add_run()
    r.text = text
    r.font.size = Pt(size_pt)
    r.font.italic = italic and not has_cjk
    set_run_fonts(r, latin=latin_face, ea=cjk_face)
    return r
```

For mixed-script runs (e.g. `"In <em>2026</em> 開始"`), split into
multiple runs at language boundaries so the italic attribute can apply
to the Latin run only.

## Audit checklist

After re-export, confirm all five layers:

- [ ] Layer 1: Each CSS class in the HTML maps to the intended family
      in the export script's font table.
- [ ] Layer 2: All declared families exist on the rendering machine
      (`fc-list | grep`).
- [ ] Layer 3: No variable-font filename pretending to be a static
      family. `~/Library/Fonts/` shows multi-file static families for
      every face used.
- [ ] Layer 4: `unzip + grep typeface` returns only the design-system
      fonts. No `Microsoft JhengHei` / `Calibri` / `Arial` / `Georgia`
      / `Consolas` residue.
- [ ] Layer 5: No CJK-containing run has `italic=True` set with a
      Latin italic face in the `<a:latin>` slot.

If all five pass and the user still reports "the type looks wrong",
ask for a screenshot pointing at the specific glyph or word — the
remaining bugs are usually license-restricted fonts not embedded into
the file (see `SKILL.md` Step 5 verification).
