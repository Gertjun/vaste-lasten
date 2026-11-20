# Roadmap – wat moet of kan er nog gebeuren

> **Dit bestand (toekomst):** alles wat nog moet of kan gebeuren: wensen, praktijktests en open punten. Het is de enige takenlijst.
> **Niet hier:** wat al gebouwd is → [`CHANGELOG.md`](CHANGELOG.md); waarom → [`DECISIONS.md`](DECISIONS.md); de stand van nu en hoe het werkt → [`README.md`](README.md).

Bijgewerkt: 20 november 2026 · versie 3.8.5

Elk punt houdt zijn nummer, ook in de app. Is een punt gebouwd, dan haal je het hier weg en zet je het nummer in de changelog achter de versie. Volgende vrije nummer: #44.

## Eerst
- #41 **Nieuwe versie voor PR #30 en #31** (klein) — De aangepaste indeling (#30) en de aparte weergave van QR-code en pincode (#31) zijn na 3.8.5 gemerged zonder nieuw versienummer. Geïnstalleerde apps halen ze daardoor misschien niet op. Versie ophogen op alle plekken (zie `CLAUDE.md`).
- #42 **Changelog op orde** (klein) — Bij de volgende versie ook het commentaar bij `WISHLIST` in `index.html` naar `ROADMAP.md` laten verwijzen. `CHANGELOG.md` mist 3.8.5 en de volgorde klopt niet (3.8.3 staat boven 3.8.4). De lijst in de app (`CHANGELOG` in `index.html`) is wel compleet.

## Praktijktests
- #43 **Overige synchronisatiescenario's** (middel) — Niet alle scenario's uit S01–S07, V01–V06 en CR01–CR09 zijn fysiek uitgevoerd (S06 en de basissynchronisatie wel, op 18 november). Zie `docs/SYNC-CONCURRENCY-ACCEPTANCE.md` voor wat synthetisch, fysiek of niet getest is. De passkey-/PRF-matrix staat bij #6.

## Wensen
Deze punten staan ook in de app onder "Op de wishlist" (`WISHLIST` in `index.html`); houd die gelijk.

- #1 **Bankafschrift importeren** (groot) — Download een CSV van je bank (ING, Rabobank, ABN AMRO) en laat de app afschrijvingen herkennen: bekende lasten automatisch afvinken en nieuwe terugkerende betalingen voorstellen. Alles wordt op je apparaat verwerkt.
- #3 **Buffer voor de gezamenlijke rekening** (middel) — Verloop per maand van wat er minimaal op de gezamenlijke rekening moet staan, zodat kwartaal-, halfjaar- en jaarlasten nooit tot een tekort leiden.
- #5 **Herinneringen via je agenda** (klein) — Agendabestand met alle afschrijvingen als terugkerende afspraken, plus een badge op het app-icoon met het aantal lasten dat nog moet worden afgevinkt.
- #6 **Vergrendelen met Face ID** (middel) — Ontgrendelen met Face ID of Touch ID en versleutelde lokale opslag. De Core-runtime ondersteunt passkeys per kluis en het opnieuw koppelen van een bestaande passkey na herinstallatie. De basiswerking is fysiek getest op iPhone Safari en Windows 11 Edge; de volledige matrix voor herinstallatie/herkoppeling en alle passkey-/PRF-combinaties staat nog open.
- #11 **Zien wat je partner heeft gewijzigd** (klein) — Bij het openen een melding zoals "Anne heeft Energie aangepast en Hypotheek afgevinkt", en een logboek van wijzigingen in de gezamenlijke lasten. Eigen lasten blijven privé.

## Geblokkeerd
- **Productiegegevensmigratie** — Niet uitgevoerd en afzonderlijk geblokkeerd; alleen na expliciet akkoord van Geert. Geen productiegegevens, tokens of privé-datarepository gebruiken voor ontwikkeltests.
