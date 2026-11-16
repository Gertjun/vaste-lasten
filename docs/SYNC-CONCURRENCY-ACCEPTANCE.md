# Sync- en concurrencyacceptatie – Vaste Lasten

**Status: NIET UITGEVOERD.** Dit protocol beschrijft de vereiste synthetische acceptatie van de PWA-Core v1.1.0-integratie in Vaste Lasten. Het is geen bewijs dat de tests al zijn uitgevoerd en geeft geen toestemming voor een productiegegevensmigratie.

## Doel en architectuurgrenzen

Vaste Lasten heeft drie afzonderlijke Core-kluizen:

| Domein | Core-remote pad | Toegang |
|---|---|---|
| Gedeeld | `pwa-core-v1/samen.json` | Beide personen, op hun eigen apparaat |
| Persoonlijk p1 | `pwa-core-v1/eigen-p1.json` | Alleen persoon 1 |
| Persoonlijk p2 | `pwa-core-v1/eigen-p2.json` | Alleen persoon 2 |

Een apparaat opent uitsluitend de gedeelde kluis en de eigen persoonlijke kluis. De andere persoonlijke kluis mag niet worden ontsleuteld, geladen, gewijzigd of opnieuw gepubliceerd. Iedere Core-synccontroller beheert exact één remote bestand.

De acceptatie moet twee verschillende eigenschappen aantonen:

1. **Samenwerking binnen hetzelfde domein:** twee onafhankelijke apparaten die dezelfde kluis gebruiken, verliezen elkaars wijzigingen niet bij gelijktijdige of offline synchronisatie.
2. **Scheiding tussen domeinen:** gedeelde, persoonlijke p1- en persoonlijke p2-gegevens blijven in hun eigen kluis en remote bestand.

Een Web Lock coördineert sessies binnen dezelfde browseropslagcontext. Een Web Lock is geen cross-device synchronismechanisme en mag niet worden gebruikt om een tweede fysiek apparaat te blokkeren. Remote concurrency wordt afgehandeld met SHA-conflictdetectie, opnieuw lezen, app-merge en retry.

## Veiligheidsgrenzen

- Gebruik uitsluitend synthetische records, synthetische sleutels en een geïsoleerde mock remote API.
- Gebruik een aparte testorigin en een aparte synthetische repository; nooit de ingestelde productie-datarepository.
- Geen echte GitHub-token, wachtwoorden, passkeys, remote JSON-inhoud of productiegegevens lezen of schrijven.
- Geen echte migratieknop gebruiken en geen legacybarrière schrijven.
- De twee testclients hebben onafhankelijke browseropslag, vault-instanties en device-ID's. Ze delen alleen de synthetische remote omgeving en de synthetische kluis die voor het scenario bedoeld is.
- Gebruik voor p1 en p2 verschillende synthetische sleutels en wachtwoorden.
- Een fout, ontbrekend bewijs of niet uitgevoerde test is NOT RUN/BLOCKED, nooit PASS.
- Log geen tokens, wachtwoorden, plaintext productiegegevens of sleutelmateriaal.

## Verplichte vervangende tests S01–S07

| ID | Scenario | Uitvoering voor Vaste Lasten | Verwacht resultaat |
|---|---|---|---|
| S01 | Twee clients schrijven vanaf dezelfde SHA | Client A en B openen dezelfde synthetische gedeelde kluis vanaf dezelfde initiële remote SHA en uploaden vrijwel gelijktijdig. | Exact één eerste upload wint. De andere client krijgt een SHA-conflict, leest de actuele envelope opnieuw en retryt. Geen stille overschrijving. |
| S02 | Beide wijzigingen blijven behouden | A en B voegen elk een ander synthetisch record toe aan dezelfde gedeelde kluis vanaf dezelfde beginstand. Herhaal aanvullend voor één persoonlijke testkluis met twee apparaten van dezelfde persoon. | Na conflict/retry zijn beide records aanwezig. Geen wijziging gaat verloren. De persoonlijke wijziging verschijnt niet in het gedeelde bestand of de persoonlijke kluis van de andere persoon. |
| S03 | Gelijke timestamps | Beide clients wijzigen hetzelfde synthetische record met gelijke wijzigingstijdstippen. | De bestaande app-merge levert een expliciete, deterministische uitkomst of meldt een oplosbaar conflict. Resultaat is niet afhankelijk van toevallige retry-volgorde. |
| S04 | Verwijderen tegenover oudere wijziging | A verwijdert een record; B wijzigt een oudere kopie en synchroniseert later. | De verwijderledger/tombstone wint. Het record wordt niet opnieuw geïntroduceerd. Controleer dat de verwijdering alleen het bedoelde domein raakt. |
| S05 | Offline wijziging en herstart | A maakt offline een wijziging, sluit/vergrendelt en herstart. B slaat ondertussen online een andere wijziging op. A komt online en synchroniseert. | Beide wijzigingen blijven behouden en worden samengevoegd. De lokale wijziging overleeft de herstart. Geen cross-domain lekkage. |
| S06 | Lokale opslagfout en herstel | Forceer een synthetische lokale opslagfout tijdens persist/flush of sync. | Flush en sync melden de fout; de vorige bevestigde envelope blijft intact; pending/error blijft zichtbaar. Een expliciete retry schrijft de volledige actuele snapshot. Geen schijnsucces of lockvrijgave vóór bevestigde opslag. |
| S07 | Oude/offline client na tombstone-acknowledgement | Een offline client houdt een oude kopie. Een andere client verwijdert het record en de actieve apparaten bevestigen de tombstone. Daarna synchroniseert de oude client. | Oude data brengt het verwijderde record niet terug. Tombstone-cleanup volgt uitsluitend de Core-device-acknowledgementregels. |

## Aanvullende Vaste Lasten-domeincontroles

Deze controles zijn verplicht naast S01–S07; zij maken de app-specifieke scheiding aantoonbaar.

| ID | Controle | Verwacht resultaat |
|---|---|---|
| V01 | p1-apparaat opent gedeeld + persoonlijk p1 | Beide bedoelde kluizen openen; persoonlijk p2 blijft vergrendeld en wordt niet ontsleuteld. |
| V02 | p2-apparaat opent gedeeld + persoonlijk p2 | Beide bedoelde kluizen openen; persoonlijk p1 blijft vergrendeld en wordt niet ontsleuteld. |
| V03 | Payload-domeinscheiding | Gedeelde velden (`meta`, `cats`, `inc`, `settle`) belanden niet in persoonlijke payloads; persoonlijke velden (`prof`, `scen`) belanden niet in de gedeelde payload. |
| V04 | Remote-pad-isolatie | Iedere synccontroller leest en schrijft uitsluitend het eigen pad: `samen.json`, `eigen-p1.json` of `eigen-p2.json` onder `pwa-core-v1/`. |
| V05 | Verkeerde sleutel/domein/envelope | Een verkeerde sleutel, domeintag of envelope wordt fail-closed geweigerd; geen fallback naar een andere kluis en geen lege kluis die over remote data heen wordt aangemaakt. |
| V06 | Apparaat van dezelfde persoon | Een tweede apparaat van p1 kan gedeeld + p1 synchroniseren; een apparaat van p2 kan gedeeld + p2 synchroniseren. Geen persoonlijke data kruist tussen p1 en p2. |

## Relatie met bestaande Core- en shelltests

De bestaande Storage Acceptance-fixture test lokale sessie-exclusiviteit, flush, storage failures en shellintegratie. De S01–S07-tests bewijzen daarnaast de remote concurrency- en merge-eigenschappen van de app-syncclient. Geen van beide testgroepen vervangt de andere.

De relevante Cryptotracker-tests zijn een bruikbaar voorbeeld van de beoogde testmethode, maar vormen geen bewijs voor Vaste Lasten. Vaste Lasten moet zijn eigen adapter-/bridge-/app-merge met synthetische clients testen.

## Acceptatiecriteria

De sync-/concurrencyacceptatie is pas akkoord wanneer:

1. S01–S07 allemaal aantoonbaar slagen op de Vaste Lasten-syncclient met twee onafhankelijke clients.
2. V01–V06 aantonen dat drie vaultdomeinen en remote paden strikt gescheiden blijven.
3. De bestaande 47 regressietests, Core-pincontrole, inline JavaScript-controle en service-worker-precachecontrole groen blijven op de code-head die wordt geaccepteerd.
4. Een praktische runtimecontrole op iPhone/iPad Safari en Windows Edge/Chrome bevestigt dat de twee bedoelde kluizen per apparaat kunnen worden geopend en de derde gesloten blijft.
5. Passkey/PRF, annulering, herinstallatie/herkoppeling, offline herstart en wachtwoordherstel afzonderlijk zijn gecontroleerd op geschikte fysieke apparaten.
6. Alle resultaten, commit-SHA's, workflow-runs, client-ID's (synthetisch), begin-SHA's, retries en uiteindelijke assertions zijn vastgelegd.

Een geslaagde Chromium-run bewijst niet automatisch gedrag in Safari/iOS/iPadOS of Windows Hello. De oude B07-cross-container lockproef is RETIRED en geen gate. Lokale Web Locks blijven wel vereist binnen dezelfde browseropslagcontext.

## Bewijsregistratie

Registreer per scenario:

- datum en tijd;
- commit SHA en test-run;
- test-ID en client-ID's (synthetisch);
- domein (shared, personal-p1 of personal-p2);
- begin-SHA en uiteindelijke remote SHA;
- uploadresultaat/statuscode en aantal retries;
- records die aantoonbaar behouden, verwijderd of geweigerd zijn;
- resultaat PASS / FAIL / NOT RUN / BLOCKED;
- verwijzing naar relevante CI-log of handmatig bewijs.

Geen geheimen, tokens, wachtwoorden, plaintext productiegegevens of sleutelmateriaal registreren.

## Huidige status

- PWA-Core v1.1.0-integratie: gemerged in Vaste Lasten PR #5.
- Automatische codevalidatie van de integratie: 47 tests geslaagd op de gedocumenteerde code-/test-head.
- Pages-workflow: eerder succesvol; dit bewijst niet dat de volledige live runtime handmatig is geaccepteerd.
- S01–S07 en V01–V06 voor Vaste Lasten: **NOT RUN**.
- Fysieke browser-/apparaatacceptatie: **NOT RUN**.
- Productiegegevensmigratie: **NIET UITGEVOERD en afzonderlijk geblokkeerd**.


---

## Acceptatieplan conflictbeoordeling – PR #9 (3.1.1)

**Status: VOORBEREID, NIET UITGEVOERD.** Deze aanvullende scenario's testen de nieuwe conflictregistratie en de gebruikerskeuze. Ze vervangen S01–S07 en V01–V06 niet; ze komen erbovenop.

### Voorwaarden vóór een praktijktest

1. Gebruik een tijdelijke preview van exact de PR-head die getest wordt. De normale Pages-site op `main` is hiervoor niet geschikt: die bevat niet noodzakelijk de PR-code.
2. Gebruik een aparte, lege synthetische GitHub-datarepository met een token dat uitsluitend toegang heeft tot die repository. Gebruik nooit de bestaande productie-datarepository of het productietoken.
3. Gebruik twee onafhankelijke browserprofielen/apparaten (A en B), met aparte lokale opslag en verschillende synthetische device-ID's. Beide clients melden aan als dezelfde testpersoon wanneer ze dezelfde persoonlijke kluis moeten delen.
4. Maak uitsluitend herkenbare testrecords, bijvoorbeeld `TEST-HUUR`, `TEST-ENERGIE` en `TEST-PROFIEL`. Geen echte namen, bedragen, contracten of bankgegevens.
5. Synchroniseer beide clients eerst volledig en controleer dat ze dezelfde uitgangsgegevens hebben. Controleer vóór CR01 dat op beide clients **nul** reviewtaken openstaan en dat geen voorbeeldrecord (`example: true`) in de actieve toestand of remote bestanden aanwezig is. Noteer de commit-SHA, preview-URL, synthetische repository en begin-SHA. Noteer nooit het token of wachtwoord.

### Gelijk-tijdstempel betrouwbaar opwekken

Een handmatige test met normale klokinstellingen kan toevallig twee verschillende milliseconden opleveren en bewijst dan geen gelijk-tijdconflict. Gebruik daarom alleen in de twee geïsoleerde testbrowserprofielen tijdelijk dezelfde testklok:

```js
window.__realDateNow = Date.now;
Date.now = () => 1800000000000;
```

Herstel de klok na het maken van de concurrerende wijzigingen en vóór het beoordelen:

```js
Date.now = window.__realDateNow;
delete window.__realDateNow;
```

Dit is uitsluitend een testhulpmiddel voor de synthetische preview. Gebruik het nooit in de normale app of op productiegegevens. Als de browser de console niet beschikbaar maakt, markeer de gelijk-tijdscenario's als BLOCKED; forceer geen test door de systeemtijd van het apparaat te wijzigen.

### Verplichte praktijkscenario's

| ID | Voorbereiding en handeling | Verwacht resultaat |
|---|---|---|
| CR01 – conflict zichtbaar | A en B openen dezelfde synthetische kluis. Zet in beide testprofielen dezelfde testklok. Zet beide offline. Wijzig op A hetzelfde testrecord van €100 naar €125 en op B van €100 naar €140. Herstel de klok; synchroniseer A en daarna B. | Er verschijnt een blijvende melding dat gegevens beoordeling nodig hebben. Beide alternatieven (€125 en €140) zijn zichtbaar. Geen van beide wordt als definitief beoordeeld zonder gebruikerskeuze. |
| CR02 – keuze synchroniseert | Kies op B expliciet €140. Breng A online en synchroniseer opnieuw. Herstart daarna beide clients en synchroniseer nogmaals. | Op beide clients is €140 de gekozen waarde; het oorspronkelijke conflict blijft gesloten en verschijnt niet opnieuw. |
| CR03 – offline en heropenen | Laat op A een conflict openstaan. Sluit/vergrendel de app, sluit de browser/PWA volledig en open opnieuw terwijl het apparaat nog offline is. | De reviewtaak en beide alternatieven zijn nog aanwezig. Na online gaan wordt de taak correct gesynchroniseerd. |
| CR04 – verschillende keuzes tegelijk | Maak op beide clients hetzelfde conflict zichtbaar. Zet de testklok opnieuw gelijk. Kies op A alternatief 1 en op B alternatief 2 voordat een van beide de keuze van de ander heeft gesynchroniseerd. Synchroniseer daarna beide kanten om en om. | De keuzes worden niet stilzwijgend overschreven. Er verschijnt een nieuw reviewconflict waarin beide gemaakte keuzes opnieuw beoordeeld kunnen worden. |
| CR05 – verwijderen tegenover bewerken | Herstel een schoon testrecord. A en B gaan offline met dezelfde testklok. A verwijdert het record; B wijzigt het. Synchroniseer achtereenvolgens. | Er verschijnt een reviewtaak met zowel de verwijdering als de bewerkte versie. De voorlopige uitkomst is op beide clients gelijk. De taak verdwijnt pas na een expliciete keuze. |
| CR06 – meerdere gegevenstypen | Genereer via de geautomatiseerde fixtures conflicten voor betaalvinkje, categorie, verrekening, metadata, inkomen, profiel en scenario. Open de preview op beide clients en bekijk de taken. | Elk conflict is herkenbaar gelabeld, toont twee alternatieven en heeft een afzonderlijke keuze. Een keuze bij het ene conflict sluit geen ander conflict. |
| CR07 – domeinscheiding | Maak één conflict in de gezamenlijke kluis en één in de persoonlijke kluis van testpersoon p1. Open op een p2-client alleen de gezamenlijke en eigen p2-kluis. | p1-conflicten en p1-alternatieven zijn niet zichtbaar op p2. Gezamenlijke conflicten zijn op beide personen zichtbaar. Geen conflictregister wordt naar een verkeerd remote bestand geschreven. |
| CR08 – oude offline kopie | Laat B offline met een openstaande conflictmelding. Laat A het conflict beoordelen en synchroniseren. Breng daarna B online en laat B synchroniseren. | B heropent het reeds beoordeelde conflict niet en draait de beslissing niet terug. |
| CR09 – herhaald synchroniseren | Synchroniseer A en B minimaal drie keer na een afgeronde keuze; herstart beide clients tussendoor. | Geen duplicaatmeldingen, geen terugkerend opgelost conflict, geen wijziging van de gekozen waarde en geen eindeloze sync-loop. |

### Uitvoering en bewijs

Voer CR01–CR09 uit op een exact vastgelegde PR-commit. Noteer per scenario:

- resultaat: PASS / FAIL / NOT RUN / BLOCKED;
- commit-SHA en preview-URL;
- apparaat/browser en browserprofiel A/B;
- synthetische device-ID's en domein (shared / personal-p1 / personal-p2);
- begin-SHA en uiteindelijke remote SHA;
- welke twee waarden zijn ingevoerd en welke keuze is gemaakt;
- of de reviewtaak na herstart en herhaalde synchronisatie correct bleef;
- verwijzing naar schermafbeeldingen of CI-log (zonder secrets of persoonsgegevens).

Een scenario is alleen PASS als beide clients na herstart dezelfde definitieve toestand tonen en de conflictadministratie geen onbedoelde open of opnieuw geopende taak bevat. Een foutmelding, ontbrekend scherm of onduidelijk resultaat is FAIL of BLOCKED, niet PASS.

### Huidige uitvoerbaarheid

- Geautomatiseerde synthetische regressietests in CI: afzonderlijk gerapporteerd bij PR #9.
- Praktische test op twee apparaten: preview is bijgewerkt naar de gefixte PR-head `12e22a0d2a9f22408e912102cb3adaff31f1f6b9`; hervatten is **BLOCKED totdat beide profielen na herladen nul reviewtaken tonen**.
- Synthetische remote repository `Gertjun/vaste-lasten-pr9-testdata`: aangemaakt en als privé geverifieerd. Het testtoken is beperkt tot deze repository en heeft een geldigheid van zeven dagen; noteer of deel het token nooit.
- Productiegegevens, productie-token en bestaande kluizen: buiten scope.


### Eerste praktijktest – bevinding 16 november 2026

- Resultaat: **BLOCKED vóór CR01**. Beide geïsoleerde browserprofielen toonden 12 reviewtaken.
- Inspectie van een taak liet zien dat beide alternatieven hetzelfde voorbeeldrecord `Hypotheek` bevatten met `example: true`.
- Geen van de taken is beoordeeld; geen bestanden zijn handmatig verwijderd en er zijn geen productiegegevens gebruikt.
- PR #9 bevat nu een regressiefix: voorbeeldrecords worden vóór samenvoegen gefilterd en eerder opgeslagen voorbeeldconflicten worden opgeschoond. De CI-regressietests zijn groen (63/63). Hervat de acceptatie pas met een nieuwe preview van de gefixte PR-head; de bestaande synthetische repository mag worden hergebruikt nadat de nieuwe code beide profielen heeft opgeschoond en nul reviewtaken toont.


### Automatische acceptatiedekking – 16 november 2026 (PR #9)

Laatste geverifieerde PR-head: `7a9f67664bb8e8a02780d6dcb3ba03f1da7d0af9`. GitHub Actions-run **#467**: **89 tests geslaagd, 0 mislukt**. De onderstaande statussen beschrijven uitsluitend geautomatiseerde synthetische dekking; ze betekenen niet dat de volledige acceptatiecriteria hierboven zijn afgerond.

| ID | Geautomatiseerde dekking | Status en beperking |
|---|---|---|
| S01 | Twee onafhankelijke kluizen lezen bewust dezelfde remote SHA; één upload krijgt HTTP 409 en retryt na opnieuw lezen. | **PASS** op de geïsoleerde mock GitHub Contents API. |
| S02 | Twee verschillende records blijven behouden na retry, afzonderlijk getest voor shared, personal-p1 en personal-p2. | **PASS** voor de drie domeinen in de synthetische syncclienttest. |
| S03 | Twee onafhankelijke clients wijzigen hetzelfde record met exact gelijke timestamps; beide uploadvolgordes doorlopen de echte syncclient-merge-route. | **PASS** in de synthetische remote-integratietest met mock GitHub Contents API; conflict-ID en canonieke alternatieven zijn in beide volgordes identiek. |
| S04 | Client A synchroniseert een verwijdering; client B synchroniseert daarna een oudere offline bewerking via de echte syncclient-route. | **PASS** in de synthetische remote-integratietest; record blijft verwijderd en de nieuwere verwijdermarkering blijft behouden. |
| S05 | Offline wijziging lokaal flushen, vault-instantie volledig sluiten/verwijderen, opnieuw openen en samenvoegen met een online wijziging van client B. | **PASS** in de synthetische Core-vault/syncintegratietest; geen fysieke browserherstart. |
| S06 | Lokale persist/flush-fout en remote HTTP 500 tijdens upload; de lokale snapshot blijft behouden en dirty, de remote SHA/envelope blijven intact en een expliciete retry uploadt de volledige actuele snapshot. | **PARTIAL**: beide Core-foutpaden zijn synthetisch getest; zichtbaarheid van de fout in de volledige UI en fysieke netwerkuitval zijn niet getest. |
| S07 | Twee onafhankelijke vault-clients registreren zich in dezelfde remote kluis; A verwijdert, B synchroniseert een oudere offline wijziging en bevestigt de verwijdering; A haalt de acknowledgement op en ruimt de tombstone op. | **PASS** in de synthetische remote-integratietest met echte Core-vaults/syncclient en mock GitHub Contents API; geen fysieke apparaten of live GitHub gebruikt. |

Aanvullende domeincontroles:

| ID | Geautomatiseerde dekking | Status |
|---|---|---|
| V01–V02 | Tests controleren dat p1/p2 alleen gedeeld plus de eigen persoonlijke kluis openen; biometrische en wachtwoordpaden zijn afzonderlijk getest. | **PARTIAL**: fysieke runtime en alle combinaties nog niet afgevinkt. |
| V03 | Legacy-splitsing en payloadvalidatie voorkomen verboden velden in het verkeerde domein. | **PASS** voor de adaptertests. |
| V04 | Registry en syncclient gebruiken aparte remote paden; de nieuwe concurrencytest controleert alle drie de paden. | **PASS** voor de synthetische tests. |
| V05 | Verkeerd wachtwoord bij envelope-import, geldig versleutelde payload met verkeerd domein en beschadigde remote ciphertext worden fail-closed geweigerd; lokale gebruikersrecords en bekende remote SHA blijven behouden. | **PASS** voor de synthetische Core-import- en remote-syncroutes; geen fysieke apparaten getest. |
| V06 | Twee clients synchroniseren ieder persoonlijk domein afzonderlijk; p1 en p2 blijven gescheiden. | **PASS** voor de synthetische domeinsync; fysieke apparaten niet getest. |

**Nog niet afgevinkt:** de volledige S01–S07-acceptatie als geheel, alle V01–V06-runtimecontroles, Safari/iOS/iPadOS, Windows Hello en de volledige passkey-/herinstallatie-/herstelproeven. De handmatige CR03 offline-herstartvariant blijft BLOCKED door de twee Edge-profielen op hetzelfde fysieke apparaat. Productiegegevensmigratie blijft afzonderlijk geblokkeerd.
