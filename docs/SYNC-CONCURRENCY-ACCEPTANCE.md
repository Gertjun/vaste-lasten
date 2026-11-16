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
