#!/usr/bin/env python3
"""Een punt van de roadmap halen als het is gebouwd of afgerond.

Gebruik (vanuit de hoofdmap van de repository):
    python3 tools/wish.py W3 [W5 ...]

Haalt de regel '- W3 **…**' (of een blok '### W3 – …') weg uit ROADMAP.md. tools/release.py doet dit
zelf voor de punten die je met --wens opgeeft; dit script is voor punten die zonder nieuwe versie
klaar zijn (bijvoorbeeld een praktijktest). Werkt de lijst WISHLIST in index.html daarna bij met
`python3 tools/release.py --alleen-wishlist`.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def remove(text, w):
    w = w.upper() if w.upper().startswith('W') else 'W' + w
    m = re.search(r'^- ' + re.escape(w) + r' \*\*.*\n', text, re.M) or \
        re.search(r'\n### ' + re.escape(w) + r' – .*?(?=\n### |\n## |\Z)', text, re.S)
    if not m:
        raise SystemExit('%s niet gevonden in ROADMAP.md' % w)
    return text[:m.start()] + text[m.end():], w


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    p = os.path.join(ROOT, 'ROADMAP.md')
    s = open(p, encoding='utf-8').read()
    for arg in sys.argv[1:]:
        for w in arg.split(','):
            s, w = remove(s, w.strip())
            print('verwijderd uit ROADMAP.md:', w)
    open(p, 'w', encoding='utf-8').write(s)
