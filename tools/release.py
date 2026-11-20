#!/usr/bin/env python3
"""Nieuwe versie van Vaste Lasten klaarzetten (vervangt release.py en build.py uit de oude werkmap).

Gebruik (vanuit de hoofdmap van de repository, op de featurebranch, pas na akkoord van Geert):
    python3 tools/release.py <patch|minor|major|x.y.z> [--wens W3,W5] "<regel>" ["<regel>" ...]
    python3 tools/release.py --alleen-wishlist        # alleen WISHLIST in index.html gelijk maken aan ROADMAP.md

Voorbeeld:
    python3 tools/release.py minor --wens W5 "Nieuw: herinneringen via je agenda."

Regels beginnen met Nieuw:, Verbeterd:, Opgelost:, Beveiliging: of Let op: (zie CLAUDE.md).

Wat het doet, op alle plekken tegelijk:
- APP_VERSION en de ingebouwde CHANGELOG in index.html (nieuwe versie bovenaan);
- CACHE in sw.js (het deel na het versienummer, zoals -core-v1.3.0, blijft staan);
- version.json;
- CHANGELOG.md: de nieuwe versie bovenaan, met de gebouwde roadmappunten achter de versie;
- ROADMAP.md: de gebouwde punten eruit en "Bijgewerkt" op vandaag en de nieuwe versie;
- WISHLIST in index.html opnieuw opgebouwd uit de sectie "## Wensen" van ROADMAP.md;
- controleert dat DATA_NEEDS niet hoger is dan de nieuwe versie en dat README.md bestaat.
Met --zip maakt het daarna ook ../releases/vaste-lasten-x.y.z.zip (alleen de app, zonder tests en tools).
"""
import datetime, json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wish  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus',
           'september', 'oktober', 'november', 'december']
vt = lambda v: tuple(int(x) for x in v.split('.'))


def rd(name):
    return open(os.path.join(ROOT, name), encoding='utf-8').read()


def wr(name, text):
    open(os.path.join(ROOT, name), 'w', encoding='utf-8').write(text)


def wishlist_from_roadmap(roadmap):
    """Regels '- W1 **Titel** (groot) — tekst' onder '## Wensen' -> lijst voor de app."""
    if '## Wensen' not in roadmap:
        return []
    part = roadmap.split('## Wensen', 1)[1].split('\n## ', 1)[0]
    return [{'nr': m.group(1), 'title': m.group(2), 'size': m.group(3), 'text': m.group(4).strip()}
            for m in re.finditer(r'^- W(\d+) \*\*(.+?)\*\* \((.+?)\) — (.+)$', part, re.M)]


def set_wishlist(html, roadmap):
    items = wishlist_from_roadmap(roadmap)
    html, n = re.subn(r'/\*WISHLIST\*/.*?/\*END\*/', lambda _: '/*WISHLIST*/' + json.dumps(items, ensure_ascii=False) + '/*END*/', html, count=1, flags=re.S)
    assert n == 1, 'WISHLIST niet gevonden in index.html'
    html = html.replace('wordt bij het bouwen ingevuld uit WISHLIST.md', 'wordt ingevuld uit ROADMAP.md door tools/release.py')
    return html, len(items)


def main(argv):
    if argv[:1] == ['--alleen-wishlist']:
        html, n = set_wishlist(rd('index.html'), rd('ROADMAP.md'))
        wr('index.html', html)
        print('WISHLIST bijgewerkt:', n, 'wensen')
        return
    if not argv:
        raise SystemExit(__doc__)
    kind, rest = argv[0], argv[1:]
    wensen, zip_ = [], False
    lines = []
    i = 0
    while i < len(rest):
        if rest[i] == '--wens':
            wensen = [w.strip().upper() if w.strip().upper().startswith('W') else 'W' + w.strip() for w in rest[i + 1].split(',') if w.strip()]
            i += 2
        elif rest[i] == '--zip':
            zip_ = True; i += 1
        else:
            lines.append(rest[i]); i += 1
    assert lines, 'geef minstens één changelogregel op'

    html = rd('index.html')
    old = re.search(r"APP_VERSION='(\d+\.\d+\.\d+)'", html).group(1)
    M, m, P = vt(old)
    version = {'major': f'{M + 1}.0.0', 'minor': f'{M}.{m + 1}.0', 'patch': f'{M}.{m}.{P + 1}'}.get(kind, kind)
    assert re.fullmatch(r'\d+\.\d+\.\d+', version), 'onbekende versie: ' + kind
    assert vt(version) > vt(old), 'versie %s is niet hoger dan %s' % (version, old)
    need = re.search(r"DATA_NEEDS='([^']*)'", html)
    assert not need or vt(need.group(1)) <= vt(version), 'DATA_NEEDS (%s) is hoger dan de versie %s' % (need.group(1), version)
    d = datetime.date.today()
    date = '%d %s %d' % (d.day, MAANDEN[d.month - 1], d.year)

    # ROADMAP.md: gebouwde punten eruit, Bijgewerkt bijwerken
    roadmap = rd('ROADMAP.md')
    for w in wensen:
        roadmap, _ = wish.remove(roadmap, w)
    roadmap, n = re.subn(r'^Bijgewerkt: .*$', 'Bijgewerkt: %s · versie %s' % (date, version), roadmap, count=1, flags=re.M)
    assert n == 1, 'regel "Bijgewerkt:" niet gevonden in ROADMAP.md'
    wr('ROADMAP.md', roadmap)

    # CHANGELOG.md: nieuwe versie bovenaan
    log = rd('CHANGELOG.md')
    assert '## %s ' % version not in log, 'versie %s staat al in CHANGELOG.md' % version
    head = '## %s — %s' % (version, date) + (' (%s)' % ', '.join(wensen) if wensen else '')
    entry = head + '\n' + ''.join('- %s\n' % l for l in lines) + '\n'
    j = re.search(r'(?m)^## ', log).start()   # vóór de bovenste versie
    wr('CHANGELOG.md', log[:j] + entry + log[j:])

    # index.html: versie, ingebouwde changelog en wishlist
    html = re.sub(r"APP_VERSION='[^']*'", "APP_VERSION='%s'" % version, html, count=1)
    cm = re.search(r'/\*CHANGELOG\*/(\[.*?\])/\*END\*/', html, re.S)
    releases = json.loads(cm.group(1))
    releases.insert(0, {'version': version, 'date': date, 'items': lines})
    html = html[:cm.start(1)] + json.dumps(releases, ensure_ascii=False) + html[cm.end(1):]
    html, nw = set_wishlist(html, roadmap)
    wr('index.html', html)

    # sw.js en version.json
    sw = rd('sw.js')
    sw, n = re.subn(r"const CACHE='vaste-lasten-\d+\.\d+\.\d+", "const CACHE='vaste-lasten-%s" % version, sw, count=1)
    assert n == 1, 'CACHE niet gevonden in sw.js'
    wr('sw.js', sw)
    wr('version.json', json.dumps({'version': version}) + '\n')

    assert os.path.exists(os.path.join(ROOT, 'README.md')) and not os.path.exists(os.path.join(ROOT, 'LEESMIJ.md')), 'de handleiding heet README.md'
    print('versie %s -> %s | %d wensen in de app | punten gebouwd: %s' % (old, version, nw, ', '.join(wensen) or '-'))

    if zip_:
        out = os.path.join(os.path.dirname(ROOT), 'releases')
        os.makedirs(out, exist_ok=True)
        z = os.path.join(out, 'vaste-lasten-%s.zip' % version)
        if os.path.exists(z):
            os.remove(z)
        files = subprocess.run(['git', '-C', ROOT, 'ls-files'], capture_output=True, text=True, check=True).stdout.split()
        app = [f for f in files if not f.startswith(('tests/', 'tools/', '.github/', 'docs/'))]
        import zipfile
        with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
            for f in app:
                zf.write(os.path.join(ROOT, f), 'vaste-lasten/' + f)
        print('zip:', z)


if __name__ == '__main__':
    main(sys.argv[1:])
