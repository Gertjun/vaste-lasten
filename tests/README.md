# Tests – Vaste Lasten

Automatische tests die controleren of de app nog goed werkt na een wijziging. Ze draaien vanzelf op GitHub bij elke push en pull request (tabblad **Actions**, workflow *Tests*), en je kunt ze ook zelf draaien.

## Twee soorten tests

| Map | Wat | Draaien |
|---|---|---|
| `tests/*.test.mjs` | Node-tests zonder browser: aansluiting op PWA-Core, de drie kluizen, synchronisatie en conflicten, verwijderingen, back-up terugzetten, apparaatkoppeling en beveiliging. | `node --test tests/*.test.mjs` |
| `tests/ui/test_*.py` | Playwright-tests in een echte (headless) Chromium: alle schermen op telefoon (393 px), iPad staand en liggend en laptop (tot 2560 px), licht en donker, met de voorbeeldgegevens. Ook de oude synchronisatie tegen een nagebootste GitHub. | `python3 tests/ui/alle_tests.py` |

Daarnaast controleert de workflow de PWA-Core-pin (`node tools/pin.mjs verify`), de precache van de service worker (`node tools/precache.mjs …`) en de syntaxis van alle scripts.

## UI-tests (tests/ui)

Deze tests zijn tussen versie 2.14 en 2.28 gemaakt en stonden tot 20 november 2026 alleen in het claude.ai-project (`claude/tools/`). Elke test hoort bij een functie; in de eerste regel staat bij welke versie.

| Test | Wat |
|---|---|
| `test_schermen.py` | Screenshots van alle onderdelen op iPhone, iPad staand en liggend en laptop (licht en donker) in `tests/ui/screens/`; nergens breder dan het scherm. |
| `test_filterplek.py` | Het filter Alles/Gezamenlijk/Eigen staat op de juiste plek per onderdeel en werkt. |
| `test_nieuwelast.py` | Knop Nieuwe last: bij Lasten op telefoon en iPad, in de zijbalk op de laptop; geen zwevende knop. |
| `test_compact.py`, `test_hoogte.py` | Afschrijvingsregels compact en binnen een lijst even hoog. |
| `test_datumvoorbij.py` | Datum voorbij en Eerstvolgende in Maand en Overzicht, ook rond het einde van de maand. |
| `test_instellingen.py`, `test_kolommen.py`, `test_instellijst.py` | Instellingen: inklapbare groepen in vaste kolommen (telefoon, iPad staand), lijst met koppen op de laptop, keuzes onthouden. |
| `test_inzicht.py` | Onderdeel Inzicht met jaargrafiek, vergelijking, categorieën en Wat als. |
| `test_eigenlabel.py`, `test_soortlabel.py` | Labels Samen en Eigen: altijd te onderscheiden, in elke accentkleur, licht en donker. |
| `test_thema.py` | Thema's: Automatisch/Licht/Donker en vijf accentkleuren, per apparaat onthouden. |
| `test_loondag.py` | Loondag met weekend en feestdagen, het blok Tot je loon. |
| `test_breedte.py`, `test_zijbalk.py` | Laptop en monitor: zijbalk van 236 px, in te klappen tot 68 px, werkvlak maximaal 1100 px, synchronisatiestatus onder het versienummer. |
| `test_kleur.py` | Blokken in Lasten in de tint van hun categorie; kleur kiezen vanaf het bolletje. |
| `test_delen.py` | Back-up en CSV via het deelmenu op iPhone/iPad, als download op de laptop. |
| `test_opruimen.py` | Grafstenen ouder dan 180 dagen worden opgeruimd, recente blijven. |
| `test_overstap.py` | Oude opslag van versie 1 wordt genegeerd; back-ups van versie 1 en van nu zijn terug te zetten. |
| `test_bijdrage.py`, `test_inleg.py`, `test_aandeel.py` | Bijdrage aan de gezamenlijke rekening als percentage van het inkomen, ingevuld bedrag voor de partner, verdeling naar bijdrage. |
| `test_sync.py` | Twee apparaten synchroniseren via de oude synchronisatie tegen een nagebootste GitHub. |
| `test_wachtwoord.py`, `test_wachtwoordwijzigen.py` | Sterke wachtwoorden met meter en oogje; wachtwoord wijzigen en het andere apparaat dat alleen het nieuwe vraagt. |
| `test_herstellen.py` | Een vorige versie uit de geschiedenis in GitHub terugzetten. |
| `test_bundelen.py`, `test_bijwerken.py`, `test_tabbladen.py` | Wijzigingen bundelen, minimale appversie en twee tabbladen. **Bekend probleem** (ROADMAP W44, W45): deze lopen vast op gedrag van de oude synchronisatie in 3.x. |

### Hoe ze werken

- Elke test start zijn eigen kleine webserver op een vaste poort (8765–8799) en opent de app uit de hoofdmap van de repository. 8799 is vrij voor proefjes.
- `_vl.py` is de gedeelde basis (`import _vl` bovenaan elke test). Sinds 3.x toont de app eerst het kluisscherm van PWA-Core; `_vl.py` sluit dat in elke browser automatisch via *Oude synchronisatie-instellingen openen*, zodat de app met de voorbeeldgegevens start zoals vóór 3.x. Gevolg: de UI-tests testen de schermen in de oude modus, niet in Core-mode (ROADMAP W46). Een test die het kluisscherm zelf wil zien, gebruikt `_vl.met_kluisscherm(browser)`.
- Datums staan vast met `page.clock.set_fixed_time(...)`, zodat de uitkomst elke dag gelijk is. GitHub wordt nagebootst met `route('https://api.github.com/**', …)`; er gaat nooit iets naar het echte GitHub.
- Uitvoer: elke controle drukt `OK …` of `FOUT …` af. `alle_tests.py` telt die, meldt Python-fouten en geeft exitcode 1 als een test (buiten `BEKEND`) mislukt.

### Zelf draaien

Je hebt Python 3.11+ en Node.js 22 nodig.

```bash
pip install playwright
python3 -m playwright install chromium
python3 tests/ui/alle_tests.py            # alles, 4 tegelijk (een paar minuten)
python3 tests/ui/alle_tests.py test_thema # één test
```

Stand op 20 november 2026 (3.8.5): 27 tests geslaagd, 1051 keer OK, 3 bekende problemen.

## Op GitHub

- Bij elke push en pull request start **Actions › Tests**. Bij de commit verschijnt een groen vinkje of een rood kruisje.
- Bij een rood kruisje in de UI-tests staat onder de run bij **Artifacts** het `ui-testrapport` met de uitvoer en schermafbeeldingen.
- De tests hebben geen invloed op de app zelf; GitHub Pages publiceert de bestanden in de hoofdmap.
