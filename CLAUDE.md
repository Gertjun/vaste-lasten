# CLAUDE.md – werkafspraken voor Claude

Dezelfde afspraken gelden voor al Geerts apps en projecten (Cryptotracker, Vaste Lasten, Energieverbruik, Games Backlog, MW4 Camo Tracker en de PWA-template).

## Aan het begin van een sessie
1. Lees het blok **Stand** in **`README.md`**, **`ROADMAP.md`** (wat er nog moet), **`DECISIONS.md`** (eerdere besluiten) en alleen de bovenste paar versies van **`CHANGELOG.md`**. Lees niet de volledige chatgeschiedenis.
2. Lees daarna alleen de code die je nodig hebt. Alles staat in `index.html`; zoek op functienaam in plaats van het hele bestand te lezen.
3. Koppel de GitHub-repository met schrijfrechten en haal de laatste versie op (`git fetch origin main`).

## Tijdens het werk
- **Taal en uitleg:** Nederlands, kort en zonder vakjargon. Alle teksten in de app zijn ook Nederlands.
- **"Hoe zou je…" of "nog niet bouwen":** eerst uitleggen en wachten op akkoord.
- **Elke wijziging is een eigen versie** (`MAJOR.MINOR.PATCH`):
  - MAJOR als Geert iets moet doen (opnieuw koppelen, alle apparaten tegelijk bijwerken);
  - MINOR voor een nieuwe functie;
  - PATCH voor een kleine verbetering of foutoplossing.
  - **Versie** op alle plekken gelijk ophogen: `APP_VERSION` en de ingebouwde `CHANGELOG` in `index.html`, `CACHE` in `sw.js`, `version.json` en "Bijgewerkt" in `ROADMAP.md`.
  - **`CHANGELOG.md`** bijwerken in gewone taal, met achter de versie de nummers van de roadmappunten die erin zijn gebouwd. Die punten haal je weg uit **`ROADMAP.md`** en uit de lijst `WISHLIST` in `index.html`.
- **Testen vóór elke push**, daarna rechtstreeks naar `main` (geen force-push, geschiedenis niet herschrijven). Gaat er iets mis: `git revert` en pushen.
- Ga je in tegen een besluit uit `DECISIONS.md`? Zeg dat en vraag het eerst.
- Nooit iets doen met de data-repository of tokens.
- Het `README.md` heet altijd `README.md` (niet `LEESMIJ.md`).
- De app wordt gedeeld met Wies. Wijzigingen aan het gezamenlijke bestand (`samen.json`) moeten ook werken als haar apparaat nog een oudere versie heeft, of krijgen een duidelijke "werk ook bij"-melding.

## Aan het eind van een sessie (altijd)
1. Het blok **Stand** in **`README.md`** overschrijven met de stand van nu (versie, wat is getest, bekende problemen). Geen sessielog: de geschiedenis staat in `CHANGELOG.md`. Nieuwe taken en open vragen met een nummer in **`ROADMAP.md`**, klare punten eruit.
2. **`DECISIONS.md`**: een nieuw `D<n>`-besluit voor elke keuze die een volgende sessie moet kennen. Oude besluiten pas je niet aan; een nieuw besluit vervangt een oud ("vervangt D3").
3. Push naar `main`.
