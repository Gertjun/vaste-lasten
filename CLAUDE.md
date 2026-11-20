# CLAUDE.md – werkafspraken voor Claude

Dezelfde opbouw en werkwijze gelden voor al Geerts apps (Cryptotracker, Vaste Lasten, Energieverbruik, Games Backlog, MW4 Camo Tracker). Wat specifiek is voor Vaste Lasten staat hieronder.

## Aan het begin van een sessie
1. Lees het blok **Stand** in **`README.md`**, **`ROADMAP.md`** (open punten en wensen), **`ARCHITECTUUR.md`** (opbouw, datamodel, conventies, stijl) en **`DECISIONS.md`** (eerdere besluiten). In het claude.ai-project staan kopieën onder `claude/`.
2. Lees daarna alleen de code die je voor de vraag nodig hebt. Het app-script staat in `index.html` (één IIFE); zoek op functienaam (zie ARCHITECTUUR §3) in plaats van het hele bestand te lezen. `js/core/` is PWA-Core: niet hier aanpassen (zie hieronder).
3. Lees **niet** de volledige chatgeschiedenis of de hele `CHANGELOG.md`; de bovenste paar versies zijn genoeg.
4. Bij HTML/CSS: volg `html-best-practices.md` uit het claude.ai-project.
5. Koppel de repository `Gertjun/vaste-lasten` met schrijfrechten (`add_repo` met `access: push`). Haal `git fetch origin main` op en maak vanaf `main` een branch `claude/…`.

## Tijdens het werk
- **Taal en uitleg:** Nederlands, kort en zonder vakjargon; Geert heeft geen IT-achtergrond. Alle teksten in de app zijn ook Nederlands.
- **"Hoe zou je …" of "nog niet bouwen":** eerst uitleggen en **wachten op akkoord**.
- **Vraag eerst** als een wijziging bestaande gegevens raakt, het datamodel verandert, PWA-Core raakt of ingaat tegen een besluit in `DECISIONS.md`.
- **PWA-Core:** bestanden uit `core-manifest.json` (`js/core/`, `css/base.css`) pas je hier niet aan. Een fix hoort in `Gertjun/PWA-Core`; meld het dan.
- **De app wordt gedeeld met Wies.** Wijzigingen aan de gezamenlijke kluis moeten ook werken als haar apparaat nog een oudere versie heeft, of verhogen `DATA_NEEDS` met een "Let op: werk alle apparaten bij"-regel (ARCHITECTUUR §4).
- **Elke wijziging via een pull request (D20):**
  1. code aanpassen op de branch `claude/…`;
  2. lokaal testen (hieronder); push nooit iets wat niet groen is;
  3. branch pushen, pull request openen en controleren dat GitHub Actions groen is;
  4. in gewone taal melden wat er verandert en **wachten op akkoord**. Nooit mergen, een versie uitbrengen of publiceren zonder dat akkoord;
  5. na akkoord de versie uitbrengen met `tools/release.py` (één commit per versie, Nederlandse boodschap die zegt wat er voor Geert verandert, bijvoorbeeld "Herinneringen via je agenda (3.9.0)"), daarna mergen.
- **Versie** (`MAJOR.MINOR.PATCH`): MAJOR als Geert iets moet doen (alle apparaten bijwerken, opnieuw koppelen), MINOR voor een nieuwe functie, PATCH voor een verbetering of foutoplossing.
  `python3 tools/release.py <patch|minor|major> --wens W5 "Nieuw: …"` zet de versie op alle plekken gelijk (`APP_VERSION` en de ingebouwde `CHANGELOG` in `index.html`, `CACHE` in `sw.js`, `version.json`, `CHANGELOG.md`, "Bijgewerkt" in `ROADMAP.md`), haalt de gebouwde roadmappunten weg en werkt de lijst `WISHLIST` in de app bij. Met `--zip` ook `../releases/vaste-lasten-x.y.z.zip`.
- **Alleen documenten gewijzigd** (README, ROADMAP, ARCHITECTUUR, DECISIONS, CLAUDE.md, tests): geen nieuwe appversie, wel een pull request.
- **Nieuw bestand of nieuwe map:** opnemen in `PRECACHE` in `sw.js` als de app het nodig heeft, en noemen in de samenvatting.
- **Nooit:** force-pushen, de geschiedenis herschrijven, branches verwijderen, of iets doen met de data-repository of tokens. Geen productiegegevens gebruiken voor tests.
- **Gaat er na het mergen iets mis** (ook als de tests op GitHub rood zijn): meteen melden, een `git revert` klaarzetten als pull request en daarna rustig de oorzaak zoeken.
- Het `README.md` heet altijd `README.md` (niet `LEESMIJ.md`).

## Testen
Zie [`tests/README.md`](tests/README.md). Vóór elke push:
- `node --test tests/*.test.mjs` (Core-aansluiting, synchronisatie, beveiliging);
- `node tools/pin.mjs verify` en `node tools/precache.mjs --manifest core-manifest.json --service-worker sw.js`;
- `python3 tests/ui/alle_tests.py` (Playwright: schermen op telefoon, iPad en laptop, licht en donker, berekeningen, oude synchronisatie). Duurt een paar minuten; start het op de achtergrond. Uitkomst: 0 mislukt; tests in `BEKEND` staan op de roadmap.
- Een nieuwe functie krijgt een eigen test in `tests/ui/` (`test_<onderwerp>.py`, `import _vl`, een eigen vrije poort, vaste klok met `page.clock.set_fixed_time` als het van de datum afhangt). Bij een foutoplossing eerst controleren dat de nieuwe test op de oude versie FOUT geeft.
- Is er voor een onderdeel geen automatische test: open de app headless op telefoon- en laptopformaat, licht en donker, en controleer dat hij start, dat de console geen fouten toont en dat de wijziging werkt. Raakt de wijziging gegevens of synchronisatie, test dan ook vergrendelen en ontgrendelen, twee apparaten (ook een gelijktijdige wijziging), twee tabbladen en gegevens van de vorige versie.

## Aan het eind van een sessie (altijd)
1. Het blok **Stand** in **`README.md`** overschrijven met de stand van nu (versie, wat is getest, bekende problemen). Geen sessielog: de geschiedenis staat in `CHANGELOG.md`.
2. **`ROADMAP.md`**: nieuwe open punten, praktijktests en wensen met het volgende vrije W-nummer; afgeronde punten eruit.
3. **`DECISIONS.md`**: een nieuw `D<n>`-besluit voor elke keuze die een volgende sessie moet kennen. Oude besluiten pas je niet aan; een nieuw besluit vervangt een oud ("vervangt D4").
4. **`ARCHITECTUUR.md`**: alleen als de opbouw, het datamodel, de conventies of de stijl veranderden.
5. Neem de bijgewerkte documenten op in de branch en de pull request. Werk daarna ook het claude.ai-project bij met de Projects-tool (`project_write` met `local_path`): `claude/README.md`, `claude/ROADMAP.md`, `claude/DECISIONS.md` en `claude/ARCHITECTUUR.md`.
