# Roadmap – wat moet of kan er nog gebeuren

> **Dit bestand (toekomst):** alles wat nog moet of kan gebeuren: wensen, praktijktests en open punten. Het is de enige takenlijst.
> **Niet hier:** wat al gebouwd is → [`CHANGELOG.md`](CHANGELOG.md); waarom → [`DECISIONS.md`](DECISIONS.md); de stand van nu → [`README.md`](README.md); hoe het in elkaar zit → [`ARCHITECTUUR.md`](ARCHITECTUUR.md).

Bijgewerkt: 25 november 2026 · kandidaat 3.9.0

Elk punt houdt zijn W-nummer, ook in de app. Is een punt gebouwd, dan haal je het hier weg (`tools/release.py --wens W5` of `tools/wish.py W5`) en zet je het nummer in de changelog achter de versie. Tot 20 november 2026 heetten de nummers `#1`, `#3` enzovoort; het getal is gelijk gebleven. Volgende vrije nummer: W49.

## Eerst
- W42 **Wishlist in de app op orde** (klein) — Bij de volgende versie: het commentaar bij `WISHLIST` in `index.html` naar `ROADMAP.md` laten verwijzen (doet `tools/release.py` vanzelf) en de nummers in de app als W-nummers tonen (nu `#1`). `CHANGELOG.md` is op 20 november op volgorde gezet en aangevuld met 3.8.5.
- W47 **Code uit index.html en een strikte CSP** (middel, in uitvoering) — De eerste inventarisatie is gedaan. De app heeft één groot inline app-script (circa 259 kB), een inline CSS-blok (circa 44,5 kB), 39 style-attributen (waarvan een deel dynamisch opgebouwd), en externe bronnen (Google Fonts, GitHub API en SheetJS). Een strikte CSP vraagt daarom meer dan bestanden verplaatsen. Uitvoering in stappen:
  1. **Inventarisatie en testbasis:** alle inline scripts/styles, dynamische stijlwijzigingen, externe bronnen en laadvolgorde vastleggen; huidige tests als regressiebasis gebruiken.
  2. **Bestanden scheiden:** app-script naar `js/app.js`, CSS naar `css/app.css`; HTML alleen markup en verwijzingen. De bestaande vendor-scripts blijven lokaal.
  3. **Inline-stijlen verwijderen:** statische en dynamische `style=`-attributen vervangen door CSS-klassen en waar nodig gecontroleerde componentklassen; ook `style.cssText` en dynamisch gegenereerde HTML nalopen.
  4. **Externe afhankelijkheden beperken:** SheetJS lokaal opnemen of een bewuste CSP-uitzondering onderbouwen; Google Fonts expliciet toestaan of lokaal maken. GitHub API blijft de enige noodzakelijke externe connectie.
  5. **CSP en controles:** CSP zonder `unsafe-inline` voor scripts en styles instellen; CI controleert dat er geen inline app-script/style of ongeautoriseerde bronnen terugkomen. CSP testen op alle schermen, QR, export, sync en offline.
  6. **Release:** precache bijwerken, tests uitvoeren, versie verhogen en apparaten bijwerken.

## Testen
- W48 **Praktijktest Core 1.4.0** — twee QR-codes op iPhone/iPad en Windows; tekstfallback, verkeerde administratie, verval, hergebruik, mislukte tweede import, herstart en passkey.
- W44 **Tweede tabblad maakt de lijst leeg (oude synchronisatie)** (middel) — In de modus *Oude synchronisatie-instellingen openen* begint een tweede tabblad zonder lasten en maakt het daarna ook de lijst in het eerste tabblad leeg. In 2.x werden de tabbladen samengevoegd (`fromOtherTab()`). `tests/ui/test_tabbladen.py` laat het zien en staat daarom als bekend probleem in `tests/ui/alle_tests.py`. Uitzoeken of dit ook in Core-mode gebeurt; zo niet, besluiten of de oude modus dit nog moet kunnen.
- W45 **Voorbeeldlasten weg na koppelen (oude synchronisatie)** (klein) — Na koppelen via de oude synchronisatie zijn de voorbeeldlasten weg; in 2.x bleven ze lokaal staan. `test_bundelen.py` en `test_bijwerken.py` vinken die voorbeelden af en lopen daardoor vast (bekend probleem in de runner). Besluiten of dit zo hoort; dan de tests eigen lasten laten aanmaken in plaats van voorbeelden te gebruiken.
- W46 **UI-tests ook in Core-mode** (middel) — De Playwright-tests in `tests/ui/` sluiten het kluisscherm via *Oude synchronisatie-instellingen openen* en testen dus de schermen in de oude modus. Een hulpfunctie in `_vl.py` die een lokale Core-kluis aanmaakt en de voorbeeldgegevens laadt, maakt het mogelijk dezelfde schermtests in Core-mode te draaien, en twee tabbladen en vergrendelen/ontgrendelen in Core-mode te testen.
- W43 **Overige synchronisatiescenario's** (middel) — Niet alle scenario's uit S01–S07, V01–V06 en CR01–CR09 zijn fysiek uitgevoerd (S06 en de basissynchronisatie wel, op 18 november). Zie `docs/SYNC-CONCURRENCY-ACCEPTANCE.md` voor wat synthetisch, fysiek of niet getest is. De passkey-/PRF-matrix staat bij W6.

## Wensen
Deze punten staan ook in de app onder "Op de wishlist" (`WISHLIST` in `index.html`); `tools/release.py` houdt die gelijk.

- W1 **Bankafschrift importeren** (groot) — Download een CSV van je bank (ING, Rabobank, ABN AMRO) en laat de app afschrijvingen herkennen: bekende lasten automatisch afvinken en nieuwe terugkerende betalingen voorstellen. Alles wordt op je apparaat verwerkt.
- W3 **Buffer voor de gezamenlijke rekening** (middel) — Verloop per maand van wat er minimaal op de gezamenlijke rekening moet staan, zodat kwartaal-, halfjaar- en jaarlasten nooit tot een tekort leiden.
- W5 **Herinneringen via je agenda** (klein) — Agendabestand met alle afschrijvingen als terugkerende afspraken, plus een badge op het app-icoon met het aantal lasten dat nog moet worden afgevinkt.
- W6 **Vergrendelen met Face ID** (middel) — Ontgrendelen met Face ID of Touch ID en versleutelde lokale opslag. De Core-runtime ondersteunt passkeys per kluis en het opnieuw koppelen van een bestaande passkey na herinstallatie. De basiswerking is fysiek getest op iPhone Safari en Windows 11 Edge; de volledige matrix voor herinstallatie/herkoppeling en alle passkey-/PRF-combinaties staat nog open.
- W11 **Zien wat je partner heeft gewijzigd** (klein) — Bij het openen een melding zoals "Anne heeft Energie aangepast en Hypotheek afgevinkt", en een logboek van wijzigingen in de gezamenlijke lasten. Eigen lasten blijven privé.

## Geblokkeerd
- **Productiegegevensmigratie** — Niet uitgevoerd en afzonderlijk geblokkeerd; alleen na expliciet akkoord van Geert. Geen productiegegevens, tokens of privé-datarepository gebruiken voor ontwikkeltests.
