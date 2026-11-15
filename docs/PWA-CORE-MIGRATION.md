# PWA-Core-migratie – Vaste Lasten

Status per 15 november 2026: PR #5 is gemerged naar `main` (`a5d1a3eeb981eb288b117803b9638a9b0c293f16`). GitHub Actions-tests (#43750295899) en Pages-deployment (#43750288231) zijn succesvol. Dit bevestigt de geslaagde workflows, niet een handmatige browser-/runtimecontrole van de live pagina. Er is geen echte datarepository geopend en geen productiegegevensmigratie of productie-write uitgevoerd.
Historische uitgangssituatie vóór migratie: `main` `1bb8a603e9c1fe98be889e9b2d6090b06335b0a5` (appversie 2.29.3).
Core-basis: PWA-Core `v1.1.0`, releasecommit `9763502c2233ca3824b6525fd5a5785fb3596c9c`.

## 1. Bestaande contracten

- Baseline op `main`: appversie 2.29.3; deze branch bereidt versie 3.0.0 voor. De app gebruikt een monolithisch klassiek `index.html`-script.
- Lokale gecombineerde state: `localStorage["vastelasten.v2"]`, met `{ samen, eigen }`. Dit bevat momenteel leesbare JSON.
- Lokale UI: `vastelasten.ui`; synchronisatieconfig: `vastelasten.v2.sync`. De GitHub-token staat sinds 2.29.2 versleuteld in IndexedDB.
- Remote bestanden in de ingestelde privé-repository:
  - `samen.json` – gezamenlijk wachtwoord; gedeelde lasten, afvinkjes, categorieën, inkomens, namen/verdeling en verrekeningen.
  - `eigen-p1.json` – wachtwoord van persoon 1; persoonlijke lasten, afvinkjes, inkomen/profiel en scenario's.
  - `eigen-p2.json` – wachtwoord van persoon 2; dezelfde persoonlijke structuur voor persoon 2.
- Legacy remote envelope: `{app:"vaste-lasten",v:2,kdf:{name,hash,iter,salt},alg:"AES-GCM",iv,ct}`; nieuwe wachtwoorden gebruiken 600.000 PBKDF2-SHA256-rondes, oude bestanden kunnen 310.000 gebruiken.
- App-merge gebruikt tijdstempels en de `del`-map. Dit contract moet blijven werken; de Core-deletion-ledger vervangt die app-merge niet.
- De feitelijke eigenaar/repository staat in de lokale configuratie op het apparaat. De code-default `vaste-lasten-data` is geen bewijs van de werkelijk ingestelde repository. Deze migratie leest of wijzigt geen datarepository vanuit ontwikkeltools.

## 2. Doelmodel

Drie Core-kluizen, elk met eigen DEK, wachtwoord, envelope, opslagprefix, device-ID, syncstatus en remote bestand:

| Domein | Lokale prefix | Core-remote pad |
|---|---|---|
| Gedeeld | `vaste-lasten-shared` | `pwa-core-v1/samen.json` |
| Persoonlijk p1 | `vaste-lasten-personal-p1` | `pwa-core-v1/eigen-p1.json` |
| Persoonlijk p2 | `vaste-lasten-personal-p2` | `pwa-core-v1/eigen-p2.json` |

Een apparaat opent alleen de gedeelde kluis en de eigen persoonlijke kluis. De andere persoonlijke kluis blijft vergrendeld en wordt niet ontsleuteld. Iedere Core-synccontroller beheert exact één remote bestand.

Payload blijft voor de bestaande app-UI herkenbaar als Store-object, met extra top-level `schema` en `domain` metadata. De bestaande `merge()`-logica blijft de app-specifieke samenvoeging verzorgen. Gedeelde velden (`meta`, `cats`, `inc`, `settle`) mogen niet in persoonlijke payloads belanden; persoonlijke velden (`prof`, `scen`) niet in de gedeelde payload.

## 3. Veilige overgang vanaf v2.29.3

Een directe overschrijving van `samen.json` met een Core-envelope is niet compatibel met oudere apps. Daarom worden legacybestanden behouden en Core-bestanden naast de oude bestanden geplaatst.

1. Nieuwe appversie voert eerst de bestaande legacy-sync uit voor gedeeld en de actieve persoon, zodat lokale wijzigingen van dit apparaat in het bestaande formaat zijn bevestigd.
2. Daarna schrijft de app, met het bestaande wachtwoord en legacy AES-GCM-formaat, `minApp: 3.0.0` naar het gedeelde legacybestand. De oude app synchroniseert `samen.json` als eerste en stopt vóór enige write zodra hij deze hogere minimumversie ziet. Het oude bestand blijft leesbaar voor oude versies; er komt geen Core-envelope overheen.
3. De nieuwe app leest en ontsleutelt de legacybestanden met de bestaande code, splitst lokale `{samen,eigen}`-state en importeert/samenvoegt deze in Core-kluizen.
4. Core-bestanden worden aangemaakt onder `pwa-core-v1/`; legacybestanden blijven als versleuteld archief en handmatige herstelbron bestaan. Na migratie schrijft de Core-app niet meer naar de legacybestanden; automatische rollback naar legacy-sync is niet voorzien.
5. Een tweede apparaat met versie 3.0.0 kan het bestaande Core-envelope importeren (zelfde wachtwoord en DEK) en daarna zijn lokale/legacy wijzigingen samenvoegen. Bij gelijktijdige eerste creatie wordt een key-mismatch expliciet hersteld door de winnende remote envelope te importeren en de lokale snapshot opnieuw samen te voegen.
6. Alleen nadat beide actieve Core-kluizen lokaal duurzaam zijn opgeslagen én hun remote writes bevestigd zijn, wordt de oude leesbare `vastelasten.v2`-state van dat apparaat verwijderd. Bij gedeeltelijk succes blijft deze bron behouden en kan de migratie veilig worden hervat.
7. Iedere persoon migreert alleen zijn/haar eigen persoonlijke bestand. De andere persoonlijke legacyfile wordt niet benaderd of ontsleuteld.

De bump naar 3.0.0 is bewust MAJOR: oudere apparaten moeten bijwerken voordat zij weer kunnen synchroniseren. Het gedeelde legacybestand vormt de compatibiliteitsbarrière voor beide personen, omdat de oude app eerst `samen.json` synchroniseert.

## 4. Herstel- en foutregels

- Nooit legacybestanden overschrijven met Core-envelopes; Core gebruikt een apart pad.
- Nooit de plaintext lokale bron verwijderen vóórdat beide actieve Core-syncs zijn bevestigd.
- Geen cross-vault transactie claimen. Gedeeld kan slagen terwijl persoonlijk faalt; de UI moet per domein status tonen en migratie hervatten.
- Een verkeerde wachtwoordcombinatie, onbekend remote formaat, hogere schema-versie of onjuiste domein-tag stopt fail-closed.
- Bij een Core-remote die al bestaat, importeer eerst diens envelope; maak niet een tweede willekeurige DEK voor hetzelfde domein.
- Bij een race om het eerste Core-bestand: behoud lokale snapshot, importeer de winnende envelope met hetzelfde wachtwoord, merge en probeer opnieuw.
- Token blijft in de bestaande versleutelde IndexedDB-opslag; token wordt alleen via `tokenFor()` opgehaald en als vluchtige Core-clientinstelling doorgegeven.
- Apparaatlocks worden voor gedeeld en eigen persoonlijk afzonderlijk verkregen; als één lock niet lukt, wordt de andere vrijgegeven.
- Eén apparaatgebonden passkey-bundel ontgrendelt met één biometrische actie de twee actieve kluizen. De app-eigen module `js/bundle-biometric.js` gebruikt een AES-GCM-bundelsleutel met uitsluitend `wrapKey`/`unwrapKey`-rechten en afzonderlijke wraps van de gedeelde en eigen persoonlijke DEK. De Core-vault-DEK's behouden hun `encrypt`/`decrypt`-rechten; PWA-Core v1.1.0 blijft byte-identiek aan de release. De andere persoonlijke kluis wordt niet opgenomen.
- Geen echte passkeys, tokens, privédatarepo of remote JSON-bestanden gebruiken in CI.

## 5. Gerealiseerde implementatie en automatische validatie

1. **Adapter voorbereid en getest:** domeinsplitsing, drie onafhankelijke vault-/sync-/lock-domeinen, een apparaatgebonden passkey-bundel voor de twee actieve domeinen, import van bestaande envelopes, herstel bij gelijktijdige eerste creatie, legacy-updatebarrière en hervatbare migratiecoördinator.
2. **Beveiligingsverharding:** payloads met velden uit een ander domein worden geweigerd; merge-resultaten worden opnieuw gevalideerd. Bij het vrijgeven van locks worden eerst beide vaults geflusht en vergrendeld. Gedeeltelijke factory-initialisatie wordt opgeruimd. Een ontbrekend remote bestand kan na migratie niet stilzwijgend als nieuwe lege kluis worden aangemaakt.
3. **Synthetische tests:** de adapter- en bridge-tests dekken domeingrenzen, lock rollback/release, factory cleanup, remote import, concurrente creatie, updatebarrière, gedeeltelijk succes, fail-closed herstel, wachtwoordontgrendeling, één biometrische prompt voor beide actieve vaultsleutels, annuleren zonder sessielock-lek, offline ontgrendelen, reconnect, passkey-herkoppeling, wachtwoordrotatie en behoud van lokale wijzigingen. Daarnaast test een echte Web Crypto-roundtrip de wraps van beide afzonderlijke DEK's; een gesimuleerde WebAuthn-authenticator doorloopt PRF-enrollment en ontgrendeling en bevestigt dat de teruggegeven bundelsleutel `wrapKey`/`unwrapKey`-rechten heeft. CI-push-run #300 (`43748990657`) en PR-run #301 (`43748995046`) op code-/test-head `c59f24ae9df151a427b92b7e6173f3692a00680b`: **47 tests geslaagd, 0 mislukt, 0 overgeslagen**. Twee extra regressietests bewijzen dat vergrendelen wacht op een lopende `persistState`-bewerking én dat een mislukte opslag `flush()` en `lock()` blokkeert totdat een latere volledige opslag slaagt. De actuele PR-head bevat daarna alleen documentatie-updates. Dezelfde workflow controleerde de exacte Core v1.1.0-pin (18 bestanden), de inline app-JavaScript en 29 statische service-worker-precache-items. Een WebAuthn-regressietest bevestigt dat herkoppeling passkeys van de gedeelde en eigen persoonlijke kluis accepteert en die van de andere gebruiker afwijst. De migratie-preflight stopt aantoonbaar wanneer een actief legacybestand ontbreekt.
4. **PWA-Core v1.1.0 gedistribueerd:** alle 18 allowlisted bestanden zijn lokaal opgenomen. `core-manifest.json` en `pwa-core.lock.json` pinnen de release op commit `9763502c2233ca3824b6525fd5a5785fb3596c9c`; SHA-256 van de exacte manifestbytes: `4ed3aaac52e28c54c2e478068285fcbe1a95ac749605aea6ce7c39f74c85f3cb`.
5. **Offline/CI-controle:** `sw.js` precachet de Core-bestanden, adapter, runtime bridge, manifest en lockfile. CI controleert Core-module-syntax, de volledige inline app-JavaScript, releasepin, volledige statische precache en alle tests.
6. **Runtime-integratie aangesloten:** `index.html` gebruikt de bridge voor Core-mode, startup en vergrendelde toestand, migratie vanuit legacy, state/load/save, online/offline ontgrendelen, sync, reconnect, wachtwoord wijzigen, versieherstel en passkeybeheer. Eén apparaatpasskey ontgrendelt lokaal de twee actieve vaults via de app-eigen `js/bundle-biometric.js`-bundelsleutel die hun afzonderlijke datasleutels omhult. De biometrische actie vindt vóór het aanvragen van sessielocks plaats; annuleren laat geen lock achter. Na lokale ontgrendeling wordt synchronisatie geprobeerd; een GitHub-storing laat de lokale sessie open. Core-metadata blijft behouden bij app-saves en oude-tabwijzigingen worden tijdelijk veiliggesteld en samengevoegd. Exportback-ups bevatten geen Core-interne metadata.
7. **Statische diff-/beveiligingsreview:** de belangrijkste paden voor passkeybundels, domeinscheiding, migratie, herstel, offline gebruik, sync en vergrendelen zijn gecontroleerd. Daarbij is een race gevonden en opgelost: `lock()` en `flushLocal()` wachten op lopende `persistState`-writes en geven een niet-herstelde opslagfout door. De regressietests en beide CI-triggers zijn groen.
8. **Nog open:** fysieke browser-/apparaatacceptatie van de volledige runtime en geïsoleerde testdeploy met synthetische gegevens. De code is gemerged en de Pages-deploymentworkflow is geslaagd; B07 fysieke iPhone/iPad-acceptatie wordt samen met de overige gemigreerde apps uitgevoerd. Geen echte datamigratie of productie-write zonder afzonderlijk akkoord.

## 6. Uitgevoerde veiligheidsgrenzen en resterende beperkingen

- Geen echte datarepository geopend.
- Geen token of echte vaultbestanden gelezen.
- Geen production writes.
- De migratiecode staat inmiddels op `main` via PR #5. De hier beschreven ontwikkelbranchstatus is historisch.
- `index.html` is aangepast op de migratiebranch. De oorspronkelijke byte-identieke backup staat in `backup/pwa-core-migration-2026-11-14/index.pre-core-integration.html`; aanvullende backups zijn per wijzigingsstap vastgelegd.
- `sw.js` is op de branch aangepast om de gepinde Core-bestanden, manifest, lockfile, `js/multi-vault-adapter.js`, `js/bundle-biometric.js` en `js/vastelasten-core.js` statisch te precachen; de oorspronkelijke service worker is byte-identiek geback-upt.
- `_config.yml` sluit `backup/` uit van de GitHub Pages-publicatie; de herstelbestanden blijven alleen in de repository beschikbaar.
- Appversie 3.0.0 is onderdeel van de gemergede `main`-code en de Pages-deploymentworkflow is geslaagd. Er is geen echte migratie of wijziging van productiegegevens uitgevoerd.

## 7. Handmatige acceptatie na afzonderlijk deploy-akkoord

Voer deze stappen uitsluitend uit op een geïsoleerde testdeploy met een aparte testrepository en synthetische gegevens. Gebruik geen productie- of privégegevens voor de acceptatie. De migratie is gemerged en de Pages-workflow is geslaagd, maar de live runtime is niet handmatig geverifieerd; gebruik de gewone gepubliceerde app niet als proefomgeving.

- [ ] iPhone/iPad Safari: installeer de PWA, controleer opstarten en lokale wachtwoordontgrendeling van gedeeld + eigen persoonlijk; controleer dat de andere persoonlijke kluis niet wordt geopend.
- [ ] Windows 11 (Edge en Chrome): herhaal wachtwoordontgrendeling en controleer dat beide actieve kluizen beschikbaar zijn.
- [ ] Passkey: registreer één apparaatgebonden passkey en verifieer dat één biometrische prompt beide actieve kluizen opent; de persoonlijke kluis van de andere gebruiker blijft gesloten.
- [ ] Passkey-annulering en herkoppeling: annuleer Face ID/Windows Hello en controleer dat geen sessielock achterblijft; koppel daarna een bestaande eigen passkey opnieuw. Controleer dat de andere persoonlijke passkey wordt geweigerd.
- [ ] Offline: ontgrendel lokaal zonder netwerk, wijzig gedeelde en persoonlijke testgegevens, sluit/vergrendel de app en controleer na herverbinden dat beide domeinen correct synchroniseren.
- [ ] Twee apparaten: migreer eerst p1 en daarna p2; controleer dat beide gedeelde gegevens zien, ieder uitsluitend de eigen persoonlijke gegevens opent en de drie remote Core-paden gescheiden blijven.
- [ ] Herstel: wijzig een Core-wachtwoord, herstel een eerdere versie en controleer dat synchronisatie en domeinvalidatie intact blijven.
- [ ] Legacybescherming: controleer dat `samen.json`, `eigen-p1.json` en `eigen-p2.json` als legacy-envelopes behouden blijven, de updatebarrière oudere appversies blokkeert en er geen Core-envelope over legacybestanden wordt geschreven.
- [ ] Rollback: exporteer/controleer eerst de herstelbestanden; test herstel uitsluitend met synthetische data. Verwijder de oude lokale bron nooit handmatig als de Core-migratie niet volledig is bevestigd.

B07 blijft een afzonderlijke fysieke acceptatiegate voor iPhone/iPad en wordt pas samen met de overige apps uitgevoerd. Geen merge, Pages-deploy, productie-migratie of productie-write zonder afzonderlijk akkoord.
