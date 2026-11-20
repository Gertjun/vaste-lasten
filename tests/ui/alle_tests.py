"""Draait alle UI-tests (test_*.py) in deze map en telt OK en FOUT.

Gebruik (vanuit de hoofdmap van de repository):
    python3 tests/ui/alle_tests.py            # alles, 4 tests tegelijk
    python3 tests/ui/alle_tests.py -j 1       # één voor één
    python3 tests/ui/alle_tests.py test_sync test_thema   # alleen deze

Een test is geslaagd als hij geen FOUT-regel en geen Python-fout geeft. test_schermen.py meldt per scherm
de overflow; die moet overal 0 zijn. Tests in BEKEND worden wel gedraaid, maar tellen niet mee voor het
eindoordeel; de reden en het roadmappunt staan erbij. Haal een test uit BEKEND zodra het punt is opgelost.
Schermafbeeldingen komen in tests/ui/screens/ (niet in git).
"""
import argparse, concurrent.futures as cf, glob, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))

# test -> reden (met roadmapnummer). Deze tests leunen op de modus "oude synchronisatie" van vóór PWA-Core.
BEKEND = {
    'test_tabbladen': 'W44: in de modus "oude synchronisatie" begint een tweede tabblad leeg en maakt het de lijst in het eerste tabblad ook leeg.',
    'test_bundelen': 'W45: na koppelen via de oude synchronisatie zijn de voorbeeldlasten weg; de test vinkt die voorbeelden af.',
    'test_bijwerken': 'W45: na koppelen via de oude synchronisatie zijn de voorbeeldlasten weg; de test vinkt die voorbeelden af.',
}


def run(name):
    t0 = time.time()
    try:
        r = subprocess.run([sys.executable, os.path.join(HERE, name + '.py')], cwd=HERE,
                           capture_output=True, text=True, timeout=600)
        out = r.stdout + r.stderr
    except subprocess.TimeoutExpired as e:
        out = (e.stdout or '') + (e.stderr or '') if isinstance(e.stdout, str) else ''
        out += '\nTIMEOUT na 600 s'
    ok = len(re.findall(r'^OK ', out, re.M))
    fout = re.findall(r'^FOUT .*$', out, re.M)
    crash = 'Traceback' in out or 'TIMEOUT' in out
    if name == 'test_schermen':
        regels = re.findall(r'^(\S+ \S+) overflow (-?\d+) (-?\d+) (-?\d+) errors (.*)$', out, re.M)
        goed = lambda x: max(map(int, x[1:4])) <= 0 and x[4] == '[]'
        ok += sum(1 for x in regels if goed(x))
        fout += ['FOUT %s overflow %s %s %s errors %s' % x for x in regels if not goed(x)]
        crash = crash or not regels
    return name, ok, fout, crash, out, time.time() - t0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('tests', nargs='*')
    ap.add_argument('-j', type=int, default=4, help='aantal tests tegelijk (standaard 4)')
    a = ap.parse_args()
    names = [n.removesuffix('.py') for n in a.tests] or sorted(os.path.basename(f)[:-3] for f in glob.glob(os.path.join(HERE, 'test_*.py')))
    totaal_ok = 0; mislukt = []; bekend = []
    with cf.ThreadPoolExecutor(a.j) as ex:
        for name, ok, fout, crash, out, sec in ex.map(run, names):
            totaal_ok += ok
            goed = not fout and not crash
            status = 'goed' if goed else ('BEKEND' if name in BEKEND else 'MISLUKT')
            print('%-26s %-7s OK %4d  FOUT %3d%s  (%.0f s)' % (name, status, ok, len(fout), '  + Python-fout' if crash else '', sec))
            if not goed:
                for f in fout[:10]:
                    print('    ' + f[:200])
                if crash:
                    print('    ' + '\n    '.join(out.strip().splitlines()[-4:]))
                (bekend if name in BEKEND else mislukt).append(name)
    print('\nTotaal: %d keer OK, %d test(s) mislukt, %d bekend probleem' % (totaal_ok, len(mislukt), len(bekend)))
    for n in bekend:
        print('  bekend: %s — %s' % (n, BEKEND[n]))
    if mislukt:
        print('  MISLUKT: ' + ', '.join(mislukt))
    sys.exit(1 if mislukt else 0)


if __name__ == '__main__':
    main()
