# Vaste Lasten

Een installeerbare web-app om maandelijks terugkerende uitgaven bij te houden. Je onderscheidt **gezamenlijke** lasten (die je met je partner deelt) van **eigen** lasten. De app synchroniseert versleuteld via een privé GitHub-repository.

## Waar vind je wat

Elk onderwerp staat op één plek.

| | Vraag | Bestand |
| --- | --- | --- |
| Heden | Waar staan we nu, wat doet de app? | dit bestand, `README.md` |
| Heden | Hoe zit de code in elkaar (opbouw, datamodel, conventies, stijl)? | [`ARCHITECTUUR.md`](ARCHITECTUUR.md) |
| Toekomst | Wat moet of kan er nog gebeuren? | [`ROADMAP.md`](ROADMAP.md) |
| Verleden | Wat is er per versie veranderd? | [`CHANGELOG.md`](CHANGELOG.md) |
| Verleden | Waarom is iets zo gekozen? | [`DECISIONS.md`](DECISIONS.md) |

Werkafspraken voor Claude: [`CLAUDE.md`](CLAUDE.md). Testen: [`tests/README.md`](tests/README.md). Achtergrond bij de overstap naar PWA-Core en de synchronisatietests (momentopnamen): map `docs/`.

## Stand

Bijgewerkt: 20 november 2026 · `main` **3.8.5** met PWA-Core v1.3.0 (immutable release). Dit blok wordt aan het eind van elke sessie overschreven.

- De repository heeft de uniforme opbouw van Geerts apps (D19): `ARCHITECTUUR.md` erbij, roadmappunten met W-nummers, `CHANGELOG.md` op volgorde en aangevuld met 3.8.5, en wijzigingen via een pull request (D20).
- De 30 Playwright-tests die alleen in het claude.ai-project stonden, staan nu in `tests/ui/` en draaien mee op GitHub. Tegen 3.8.5: 27 geslaagd (1051 keer OK); 3 lopen vast op gedrag van de oude synchronisatie (W44, W45). De 150 node-tests slagen.
- Gevonden bij het testen: in de modus *Oude synchronisatie-instellingen openen* maakt een tweede tabblad de lijst leeg (W44). `index.html` heeft geen CSP en één groot inline script, anders dan de andere apps (W47).
- QR-koppeling via PAIR-2 (PR #28): alleen de GitHub Sync-instellingen gaan over, geen kluisgegevens, wachtwoorden of passkeys. Eenvoudiger inlogscherm sinds 3.8.4.
- Na 3.8.5 gemerged zonder nieuw versienummer: indeling (PR #30) en aparte weergave van QR-code en pincode (PR #31), zie W41.
- Fysiek getest door Geert op 18 november op iPhone Safari en Windows 11 Edge: aanmaken, wijzigen en verwijderen synchroniseren in beide richtingen, ook na netwerkuitval (S06). De volledige testmatrix is niet afgevinkt (W6 en W43).
- Productiegegevensmigratie is niet uitgevoerd en blijft geblokkeerd.

## Wat staat er in deze repository

| Bestand of map | Inhoud |
|---|---|
| `index.html` | De app: opmaak, schermen en het app-script. |
| `js/` | Aansluiting op PWA-Core (kluizen, synchronisatie, passkey, koppelen, back-up); `js/core/` is PWA-Core zelf. |
| `css/base.css` | Gedeelde basisopmaak uit PWA-Core. |
| `sw.js`, `version.json` | Laten de app offline werken en updates binnenkomen. |
| `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png` | Naam en iconen voor het beginscherm. |
| `core-manifest.json`, `pwa-core.lock.json` | Welke PWA-Core-release erin zit, met controlegetallen. |
| `tests/` | Automatische tests (zie [tests/README.md](tests/README.md)). |
| `tools/` | Hulpscripts: PWA-Core controleren, een nieuwe versie uitbrengen, een roadmappunt afvinken. |
| `docs/` | Achtergrond bij PWA-Core en de synchronisatietests. |
| `ARCHITECTUUR.md`, `ROADMAP.md`, `CHANGELOG.md`, `DECISIONS.md`, `CLAUDE.md` | Opbouw, plannen, versies, besluiten en werkafspraken. |

De app is gewoon HTML, CSS en JavaScript, zonder framework of bouwstap. GitHub Pages publiceert de bestanden in de hoofdmap.

## Onderdelen

- **Overzicht** (startscherm): wat er nu moet gebeuren. Contracten die aandacht vragen, *Tot je loon* (wat er tot je volgende loon nog van je eigen rekening afgaat, als je je loondag hebt ingesteld), de stand van deze maand, afschrijvingen om af te vinken (eerst wat een voorbije datum heeft, daarna wat binnenkort komt, aan het eind van de maand ook uit de volgende maand, of tot je volgende loon), de gezamenlijke rekening en verrekenen tussen jullie.
- **Maand**: de afvinklijst per maand, met *Datum voorbij* (nog niet afgevinkt terwijl de datum geweest is), *Nog te betalen* en *Betaald*. Tik op een bedrag om het werkelijk afgeschreven bedrag in te vullen.
- **Lasten**: al je vaste lasten, per categorie of gesorteerd, met zoeken. Eenmalige posten en beëindigde lasten staan apart.
- **Inzicht**: de kosten met een jaargrafiek, de vergelijking met vorig jaar, de verdeling per categorie, inkomen en wat overblijft, en Wat als-scenario's. Maken jullie elk een vast deel van je netto inkomen over naar de gezamenlijke rekening (bijvoorbeeld 75%), vul dat percentage dan in bij *Huishouden → Verdeling*: je vaste lasten zijn dan die bijdrage plus je eigen lasten, en het blok *Gezamenlijke rekening* in het Overzicht laat zien wat ieder overmaakt en of dat genoeg is. Heeft je partner nog geen inkomen ingevuld, dan kun je daar ook zelf een bedrag voor je partner invullen om mee te rekenen. Zijn beide bedragen bekend (een inkomen of een ingevuld bedrag), dan rekent de app jullie aandeel in de gezamenlijke lasten zelf uit op basis van wat ieder overmaakt.
- **Instellingen**: vijf groepen die je in- en uitklapt: *Synchronisatie* (koppelen en van wie dit apparaat is, met de status in de kop), *Huishouden* (inkomen, loondag, verdeling en categorieën), *Weergave* (Automatisch, Licht of Donker en een accentkleur, per apparaat), *Gegevens* (exporteren naar Excel of CSV en back-up) en *Over de app*. De app onthoudt welke groepen je open hebt.

## Wat is privé en wat gedeeld

| Gedeeld met je partner (`pwa-core-v1/samen.json`) | Alleen voor jou (`pwa-core-v1/eigen-p1.json` / `pwa-core-v1/eigen-p2.json`) |
|---|---|
| Gezamenlijke lasten en het afvinken ervan | Je eigen lasten en het afvinken ervan |
| Namen, verdeling (ook het percentage voor de gezamenlijke rekening) en categorieën | Je loondag |
| Wie een gezamenlijke last betaalt en de verrekeningen | Je Wat als-scenario's |
| Jullie inkomens (sinds 2.28.0) | |

## Indeling per apparaat

De app past zich aan de schermbreedte aan, dus ook bij Split View op de iPad of een smaller laptopvenster.

- **iPhone**: één kolom, tabbladen in een balk onderin binnen bereik van je duim, grotere tikvlakken. *Nieuwe last* staat bij Lasten, naast het zoekveld.
- **iPad staand**: *Nieuwe last* bij Lasten, samenvatting als brede band, *Nog te betalen* en *Betaald* naast elkaar, categorieën in twee kolommen.
- **iPad liggend en laptop**: een vaste zijbalk met de onderdelen, die je met het pijltje bovenin (of de toets `[`) inklapt tot alleen pictogrammen. Bovenin de zijbalk staan de naam van de app, het versienummer met de synchronisatiestatus eronder, en de knop *Nieuwe last* boven *Overzicht*. Ingeklapt zie je de status als stip en *Nieuwe last* als plusknop. Boven het werkvlak staat de naam van het onderdeel; het werkvlak gebruikt twee tot drie kolommen.
- **Laptop-sneltoetsen**: `N` nieuwe last, `/` zoeken, `←` `→` vorige of volgende maand, `1` tot `5` onderdelen, `[` zijbalk in- of uitklappen, `Esc` sluit het formulier.

## PWA-Core v1.1.0 en de gegevensverdeling

Vanaf appversie **3.0.0** gebruikt Vaste Lasten PWA-Core v1.1.0 als gedeelde technische basis. De Core-code wordt meegeleverd in deze app-repository; de app haalt tijdens gebruik geen code uit de PWA-Core-repository op. De exacte release is vastgezet in `core-manifest.json` en `pwa-core.lock.json`, en de service worker precachet de Core-modules voor offline gebruik.

De app gebruikt drie onafhankelijke kluizen:

| Kluis | Remote bestand in de privé-repository | Inhoud | Sleutel |
|---|---|---|---|
| Gezamenlijk | `pwa-core-v1/samen.json` | Gezamenlijke lasten, afvinken, namen, verdeling, categorieën, inkomen en verrekeningen | Gezamenlijk wachtwoord |
| Persoonlijk persoon 1 | `pwa-core-v1/eigen-p1.json` | Eigen lasten, afvinken, profiel, loondag en scenario's van persoon 1 | Eigen wachtwoord persoon 1 |
| Persoonlijk persoon 2 | `pwa-core-v1/eigen-p2.json` | Eigen lasten, afvinken, profiel, loondag en scenario's van persoon 2 | Eigen wachtwoord persoon 2 |

Elke kluis heeft een eigen datasleutel, wachtwoord, lokale opslagruimte en synchronisatie. Eén apparaatgebonden passkey kan met één biometrische actie de sleutelbundel openen die de twee actieve datasleutels (gezamenlijk + eigen persoonlijk) afzonderlijk omhult. De onderliggende kluizen blijven cryptografisch gescheiden; de persoonlijke kluis van de andere gebruiker wordt niet geopend. Na een nieuwe installatie kan de bestaande passkey na een eenmalige wachtwoordontgrendeling opnieuw aan de lokale sleutelbundel worden gekoppeld.

De oude bestanden `samen.json`, `eigen-p1.json` en `eigen-p2.json` blijven tijdens en na de migratie bewaard als terugvalbron. De migratie zet in het oude gezamenlijke bestand een versiebarrière van 3.0.0, zodat oudere appversies geen gegevens meer kunnen terugschrijven.

## Migreren naar PWA-Core

1. Werk eerst alle apparaten bij naar appversie **3.0.0**.
2. Open de geïnstalleerde PWA en ga naar **Instellingen → Synchronisatie**.
3. Vul bij **Overstappen naar PWA-Core** het bestaande gezamenlijke en eigen wachtwoord in. Die wachtwoorden worden ook de wachtwoorden van de nieuwe Core-kluizen; je kunt ze daarna afzonderlijk wijzigen.
4. Herhaal de migratie op ieder apparaat. Gebruik op alle apparaten dezelfde wachtwoorden voor dezelfde kluizen.
5. Laat de oude bestanden in de privé-repository staan. Verwijder ze niet handmatig.

Na de migratie werkt het apparaat met de Core-kluizen. Een apparaat dat nog niet is gemigreerd kan tijdelijk nog met de legacybestanden werken; wijzigingen daarvan worden meegenomen wanneer dat apparaat zelf migreert. Oudere versies dan 3.0.0 worden door de versiebarrière geblokkeerd.

Ieder ziet dus de gezamenlijke lasten plus zijn of haar eigen persoonlijke lasten, maar niet die van de ander.

## 1. App publiceren (publieke repository)

1. Maak op GitHub een repository `vaste-lasten`, **Public**.
2. Upload alle bestanden uit deze map naar de hoofdmap van de repo.
3. Ga naar **Settings → Pages**, kies *Deploy from a branch*, branch `main`, map `/ (root)`, **Save**.
4. De app staat na een minuut op `https://<gebruikersnaam>.github.io/vaste-lasten/`.

Bijwerken van een eerdere versie: vervang `index.html` en `sw.js`.

## 2. Privé-repository voor de gegevens

1. Maak een repository `vaste-lasten-data`, **Private**, en vink *Add a README file* aan.

## 3. Tokens aanmaken (door de eigenaar van de repo)

Je partner heeft geen GitHub-account nodig. Jij maakt twee tokens aan, één voor jezelf en één voor je partner, zodat je ze los van elkaar kunt intrekken.

1. **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Naam: `Vaste Lasten – Geert` (de tweede: `Vaste Lasten – partner`). Vervaldatum: bijvoorbeeld 1 jaar.
3. **Repository access**: *Only select repositories* → alleen `vaste-lasten-data`.
4. **Permissions → Repository permissions → Contents**: *Read and write*.
5. **Generate token**, en kopieer hem meteen. Bewaar hem in je wachtwoordmanager.

Geef je partner de tweede token op een veilige manier, bijvoorbeeld via een gedeelde kluis in je wachtwoordmanager, of laat hem direct op haar telefoon intypen.

## 4. Koppelen: eerste persoon

1. Open de app → **Instellingen → Synchroniseren via GitHub**.
2. Vul je GitHub-gebruikersnaam, `vaste-lasten-data` en je token in → **Verder**.
3. Vul jouw naam, de naam van je partner, een **gezamenlijk wachtwoord** (2×) en een **eigen wachtwoord** (2×) in → **Koppelen**.
4. Zet daarna bij *Lasten* de gedeelde lasten om naar **Gezamenlijk** (tik op de last → Soort → Gezamenlijk → Opslaan).

## 5. Koppelen: partner

1. Partner installeert de app vanaf dezelfde link.
2. **Instellingen → Synchroniseren via GitHub**: vul **jouw** GitHub-gebruikersnaam in (de eigenaar), `vaste-lasten-data` en de partner-token → **Verder**.
3. Vul het gezamenlijke wachtwoord in → **Verder**.
4. Kies de eigen naam, kies een eigen wachtwoord (2×) → **Koppelen**.

Een tweede apparaat van dezelfde persoon koppel je op dezelfde manier: kies dezelfde naam en gebruik hetzelfde eigen wachtwoord.

## Wachtwoord wijzigen

1. Ga naar **Instellingen → Synchronisatie → Wachtwoord wijzigen**.
2. Kies *Gezamenlijk* of *Jouw eigen*, vul het huidige wachtwoord in en twee keer het nieuwe (minstens 12 tekens) → **Wachtwoord wijzigen**.
3. De app versleutelt het bestand in GitHub opnieuw met het nieuwe wachtwoord.
4. Je andere apparaten, en bij het gezamenlijke wachtwoord ook die van je partner, tonen daarna *Wachtwoord nodig*. Vul daar één keer het nieuwe wachtwoord in; wat je op dat apparaat had gewijzigd blijft bewaard.

Vorige versies van vóór de wijziging kun je nog terugzetten op apparaten die toen al gekoppeld waren.

## Verdeling en inleg

- Onder **Instellingen → Huishouden** stel je de namen en de standaardverdeling in (bijvoorbeeld 60/40). Dat geldt voor jullie allebei.
- Per gezamenlijke last kun je afwijken via *Jouw deel (%)*. Leeg laten = standaard.
- **Gezamenlijke rekening** toont wat ieder maandelijks moet overmaken. Kwartaal- en jaarbedragen zijn over het jaar gespreid.
- Met de knoppen *Alles · Gezamenlijk · Eigen* filter je alle schermen.

## Veiligheid

- De gegevensbestanden worden op het apparaat versleuteld (AES-256-GCM, sleutel via PBKDF2) voordat ze naar GitHub gaan. De GitHub-token wordt daarnaast lokaal met AES-GCM versleuteld in IndexedDB opgeslagen; de sleutel is niet-exporteerbaar.
- Wachtwoorden worden nergens opgeslagen. Elk apparaat bewaart alleen een afgeleide sleutel die niet exporteerbaar is.
- De lokale tokenversleuteling beschermt tegen het direct uitlezen van de token uit `localStorage`, maar niet tegen kwaadaardige scripts die binnen dezelfde website draaien. Houd browser en apparaat daarom bijgewerkt en gebruik geen onbekende browseruitbreidingen.
- Let op: de legacyversie vóór PWA-Core bewaarde lokale lasten nog als leesbare gegevens in `localStorage`. In Core-mode worden de drie domeinen lokaal afzonderlijk versleuteld; de oude lokale bron wordt pas verwijderd nadat de actieve Core-domeinen lokaal én remote zijn bevestigd. De oude remote JSON-bestanden blijven als terugvalbron behouden.
- Vergeet je een wachtwoord, dan is dat bestand in GitHub onbruikbaar. De gegevens op je apparaten blijven wel staan.
- Iemand met een token kan de bestanden technisch overschrijven of verwijderen, maar niet lezen zonder het bijbehorende wachtwoord. GitHub bewaart elke oude versie in de geschiedenis.
- Apparaat kwijt? Trek de token van die persoon in op GitHub en maak een nieuwe aan.
- Een back-up van *Download als bestand* is **niet** versleuteld. Zet die nooit in een repository.

## Problemen

| Melding | Oplossing |
|---|---|
| Repository niet gevonden | Controleer de gebruikersnaam van de eigenaar, de repo-naam en of de token toegang heeft tot precies deze repo. |
| De token is ongeldig of verlopen | Maak een nieuwe token aan, tik *Ontkoppelen* en koppel opnieuw. |
| De token mag niet schrijven | Zet *Contents* op *Read and write* bij de token. |
| Gezamenlijk wachtwoord klopt niet | Gebruik het wachtwoord dat de eerste persoon heeft gekozen. |
| Eigen wachtwoord klopt niet | Je hebt op een ander apparaat al een eigen wachtwoord gekozen; gebruik dat. Of je koos de verkeerde naam. |
| Het gezamenlijke wachtwoord is gewijzigd | Het wachtwoord is op een ander apparaat veranderd. Vul het nieuwe in en tik *Ontgrendelen*. |
| Deze repository is openbaar | Zet de data-repository op *Private* via Settings → General → Danger Zone. |

## App bijwerken

Elke versie heeft een eigen versienummer. Je ziet het klein naast de naam, linksboven; tik erop voor de lijst met wijzigingen. Alles staat ook in `CHANGELOG.md`.

1. Een nieuwe versie komt via een pull request in `main` (na jouw akkoord); GitHub Pages zet hem binnen een paar minuten online.
2. Op je apparaten verandert het label linksboven binnen een paar minuten in **Update beschikbaar** (op de iPhone: **Update**). Tik erop en de app werkt zichzelf bij.
3. Werk ook de apparaten van je partner bij, zeker bij een versie met *Let op* in de changelog.

De app controleert op updates bij openen, als je hem weer naar voren haalt en als je weer online komt.

## Versies en tests

- Versienummers hebben de vorm `MAJOR.MINOR.PATCH`. **MAJOR** betekent dat je iets moet doen (bijvoorbeeld alle apparaten bijwerken), **MINOR** een nieuwe functie, **PATCH** een verbetering of foutoplossing. Zie de [changelog](CHANGELOG.md).
- Bij elke wijziging draaien op GitHub automatisch tests (tabblad **Actions**): de aansluiting op PWA-Core, synchronisatie en beveiliging, en alle schermen op telefoon-, iPad- en laptopformaat in licht en donker.
