# PWA-Core-migratie – Vaste Lasten

Status: migratievoorbereiding afgerond; Core v1.1.0 is lokaal vastgepind en geprecachet. De runtime-integratie in `index.html` moet nog worden gebouwd.
Datum: 14 november 2026.
Uitgangspunt: Vaste Lasten `main` `1bb8a603e9c1fe98be889e9b2d6090b06335b0a5`.
Core-basis: PWA-Core `v1.1.0`, releasecommit `9763502c2233ca3824b6525fd5a5785fb3596c9c`.

## 1. Bestaande contracten

- Huidige appversie: 2.29.3; monolithische klassieke `index.html`-script.
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
4. Core-bestanden worden aangemaakt onder `pwa-core-v1/`; legacybestanden blijven als versleutelde rollback-/archiefbron bestaan.
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
- Passkeyregistratie blijft per kluis gescheiden; de eerste versie kan dus twee biometrische acties vragen.
- Geen echte passkeys, tokens, privédatarepo of remote JSON-bestanden gebruiken in CI.

## 5. Voortgang en nog te bouwen

1. **Adapter voorbereid en getest:** domeinsplitsing, drie onafhankelijke vault-/sync-/lock-/biometric-instanties, import van bestaande envelopes, herstel bij gelijktijdige eerste creatie, legacy-updatebarrière en hervatbare migratiecoördinator.
2. **Beveiligingsverharding:** payloads met velden uit een ander domein worden geweigerd; merge-resultaten worden opnieuw gevalideerd. Bij het vrijgeven van locks worden eerst beide vaults geflusht en vergrendeld. Gedeeltelijke factory-initialisatie wordt opgeruimd. Een ontbrekend remote bestand kan na migratie niet stilzwijgend als nieuwe lege kluis worden aangemaakt.
3. **Synthetische tests:** de adapter- en bridge-tests dekken domeingrenzen, lock rollback/release, factory cleanup, remote import, concurrente creatie, updatebarrière, gedeeltelijk succes, fail-closed herstel, wachtwoord-/biometrisch ontgrendelen, offline ontgrendelen, reconnect en expliciet lokaal flushen zonder netwerk. De laatste run #103 rapporteert 30 geslaagde tests en 0 fouten.
4. **PWA-Core v1.1.0 gedistribueerd:** alle 18 allowlisted bestanden zijn lokaal opgenomen. `core-manifest.json` en `pwa-core.lock.json` pinnen de release op commit `9763502c2233ca3824b6525fd5a5785fb3596c9c`; SHA-256 van de exacte manifestbytes: `4ed3aaac52e28c54c2e478068285fcbe1a95ac749605aea6ce7c39f74c85f3cb`.
5. **Offline/CI-controle:** `sw.js` precachet de Core-bestanden, manifest en lockfile. CI controleert module-syntax, releasepin, volledige statische precache en alle tests. Run #87 is volledig geslaagd.
6. **Runtimebrug gereed, appkoppeling nog te bouwen:** `js/vastelasten-core.js` koppelt de bestaande Store-merge aan de Core-factories en biedt migratie, online/offline ontgrendelen, opslaan, synchroniseren, wachtwoord wijzigen, passkeybeheer, herstel en apparaatbeheer. Vier bridge-tests plus de adaptertests draaien in CI. De brug is nog niet vanuit `index.html` aangeroepen; de volgende fase is de app-startup, UI, state/load/save en sync op deze brug aansluiten.
7. **Acceptatie:** draft PR, CI en diffreview. Geen merge, Pages-deploy of echte datamigratie zonder afzonderlijk akkoord.

## 6. Grenzen van deze branch

- Geen echte datarepository geopend.
- Geen token of echte vaultbestanden gelezen.
- Geen production writes.
- Geen wijzigingen aan `main`; alle wijzigingen staan op de draft-migratiebranch.
- `index.html` en de bestaande app-runtime zijn nog niet aangepast of gekoppeld. Een byte-identieke backup staat in `backup/pwa-core-migration-2026-11-14/index.pre-core-integration.html`.
- `sw.js` is op de branch aangepast om de gepinde Core-bestanden, manifest, lockfile en `js/vastelasten-core.js` statisch te precachen; de oorspronkelijke service worker en de tussenvarianten zijn byte-identiek geback-upt.
- Geen appversie 3.0.0, Pages-deploy, echte migratie of wijziging van productiegegevens totdat de runtime-integratie en acceptatietests gereed zijn.
