# NOTES – Vaste Lasten

De **actuele stand**: versie, open punten en sessielog. Werk dit bij aan het eind van elke sessie (zie `CLAUDE.md`). Besluiten staan in `DECISIONS.md`, wensen in `WISHLIST.md`.

Laatst bijgewerkt: 17 november 2026 · versie **3.6.1 in voorbereiding** (bevestigde back-upopslag in PWA-Core).

---

## 1. Werkwijze

Zie `CLAUDE.md`. De multi-vault-integratie is via PR #5 gemerged naar `main`. Vervolgwijzigingen lopen via afzonderlijke branches/PR's. Geen productiegegevensmigratie of productie-write zonder expliciet akkoord.

## 2. Stand

- **PR #13 – 3.6.0:** de Core-runtime ondersteunt per administratie een eigen namespace en versleutelde workspace-identiteit. De standaardadministratie behoudt de bestaande prefixes, remote paden en payloadstructuur; extra administraties krijgen unieke lokale prefixes en online paden onder `workspaces/<kluiscode>/pwa-core-v1/`. Bij iedere app-start verschijnt eerst de administratiekeuze. Tests controleren standaardpadbehoud, gescheiden remote bestanden, bescherming tegen een verkeerde workspace-identiteit, online heropening met latere remote wijzigingen, vrijgave van workspace-vaultinstanties en passkey-prefixen. Workflow #627 op code-head `7eb883706f8fa1b6bae8b8fbbd31a25bcec97c81` is groen: 125/125 tests, 0 fouten en 0 overgeslagen. Core-modulecontrole, inline app-JavaScript, release-pin en service-worker-precache zijn eveneens geslaagd. PR #13 is inmiddels gemerged naar main op 17 november 2026. De daaropvolgende herstel-/back-upverbetering staat apart op featurebranch; niet mergen of deployen zonder akkoord.

Vaste Lasten gebruikt op `main` PWA-Core v1.1.0 als vastgepinde, meegeleverde basis. PR #5 is op 15 november 2026 gemerged; de actuele `main`-head vóór deze documentatie-PR is `77591c46404698371d11f04e4c5c05c77feb58f2`. De GitHub Actions-testworkflow (#43750295899) en Pages-deployment (#43750288231) zijn succesvol. Dit bevestigt de workflow, niet een handmatige runtimecontrole van de live pagina. De Core-modules worden door de service worker geprecachet; de app haalt tijdens gebruik geen Core-code op uit de Core-repository.

De runtime is aangesloten op drie afzonderlijke kluizen:
- gedeeld: `pwa-core-v1/samen.json`;
- persoonlijk p1: `pwa-core-v1/eigen-p1.json`;
- persoonlijk p2: `pwa-core-v1/eigen-p2.json`.

Elk apparaat opent alleen de gedeelde kluis en de persoonlijke kluis van de gebruiker van dat apparaat. De bestaande legacybestanden blijven als terugvalbron behouden. De app zet bij de eerste migratie `minApp: 3.0.0` in het oude gedeelde bestand, zodat oudere versies niet meer kunnen terugschrijven.

De branch bevat:
- multi-vault-adapter en migratiecoördinator;
- runtime bridge voor online/offline ontgrendelen, opslaan, synchroniseren, wachtwoordbeheer, herstel en passkeybeheer;
- één apparaatgebonden passkeybundel voor gedeeld + de actieve persoonlijke kluis, met afzonderlijke DEK-wrappers en een app-eigen WebAuthn PRF-module;
- behoud van Core-deletion/device metadata tijdens app-saves;
- bescherming tegen het opnieuw publiceren van ontbrekende remote kluizen;
- herstel van lokale wijzigingen bij een remote wachtwoordwijziging;
- CI-controle op Core-modules, de volledige inline app-JavaScript, release-pin, service-worker-precache en tests.

Laatste geverifieerde PR #9-code-/test-head `686a44ac1e9138836a56ceaf5604ae3df8989839`: CI **#469 en #470**, elk 89 tests geslaagd, 0 mislukt. Core-modulecontrole, inline app-JavaScript, release-pin en service-worker-precache zijn groen. S01/S02 en nu ook S03/S04/S07 zijn via de echte Core-vault-/syncclientcode met twee onafhankelijke synthetische clients en een mock GitHub Contents API getest; S03 controleert beide uploadvolgordes, S04 een oudere offline bewerking tegenover een nieuwere verwijdering en S07 device-acknowledgement plus tombstone-opruiming. V05 blijft PASS; S06 blijft PARTIAL (UI-foutzichtbaarheid en fysieke netwerkuitval niet getest). De fysieke acceptatietest op iPhone Safari en Windows 11 Edge is op 16 november 2026 door de gebruiker als geslaagd gemeld voor synchronisatie, scheiding van gedeelde/persoonlijke kluizen, offline wijziging tegenover verwijdering en biometrisch vergrendelen/ontgrendelen. Dit is geen volledige afvinking van alle S01–S07/V01–V06/CR01–CR09-scenario's. Productiegegevensmigratie is NIET UITGEVOERD en blijft afzonderlijk geblokkeerd.

## 3. Open punten

0. PR #10: lege Core-start is geïmplementeerd op featurebranch `feat/empty-pwa-core-vault-setup`; draft review en volledige CI moeten nog groen worden. Geautomatiseerde synthetische tests zijn toegevoegd. Geen legacydata of productiekluis aangeraakt. Zie `docs/EMPTY-CORE-SETUP.md`.

1. Aanvullende browser-/apparaatacceptatie van de volledige Vaste Lasten-runtime: wachtwoordmigratie, herstel, herinstallatie/herkoppeling en de resterende passkey-/PRF-combinaties. De fysieke praktijkscope op iPhone Safari en Windows 11 Edge is op 16 november 2026 door de gebruiker als geslaagd gemeld.
2. De resterende S01–S07- en V01–V06-acceptatiepunten integraal afvinken; S06 blijft PARTIAL voor UI-foutzichtbaarheid en fysieke netwerkuitval.
3. Geïsoleerde synthetische acceptatie afronden vóór enige echte data-cutover. De integratie is al gemerged en de Pages-deploymentworkflow is geslaagd; een echte productiegegevensmigratie blijft afzonderlijk geblokkeerd. Geen test gebruikt de echte privé-datarepository, tokens, passkeys of productiegegevens.

Geen echte privé-datarepository, productie-token, echte passkey of productiegegevens gebruikt tijdens ontwikkeling en tests.

## 4. Sessielog

- **17 nov 2026 – back-upherstel PWA-Core (3.6.1):** de import bouwt eerst een aparte snapshot op en wacht op `persistState` plus `flushLocal` voor beide actieve Core-kluizen. De succesmelding betreft lokale opslag; online synchronisatie loopt via de bestaande route. Opslagfouten worden onderscheiden van ongeldige back-ups en de Core-runtime blijft leidend bij mogelijk gedeeltelijk succes. Synthetische tests toegevoegd voor de merge, behoud van betaalhistorie/metadata, wachten op opslagbevestiging en foutafhandeling. PR volgt; geen echte back-up of productiegegevens gebruikt in tests.

- **17 nov 2026 – herstel vanaf vergrendelscherm:** PR #13 voegt een route terug naar kluiskeuze toe zonder gegevens te wissen. Een afzonderlijk bevestigde lokale reset raakt alleen de gekozen workspace op dit apparaat; remote GitHub-bestanden en andere workspaces blijven behouden.
- **17 nov 2026 – testcorrectie:** op commit `31c0e9e14068f52844b1b8b32f592b8b50d18e5f` slaagde workflow #572 met 118/118 tests. Dit was vóór de daaropvolgende workspace-refactor en is dus geen testbewijs voor de huidige code.
- **17 nov 2026 – benoemde administraties:** PR #13 voegt een workspace-register, lokale/online keuze, unieke opslagprefixen en remote paden per kluiscode toe. Bij iedere app-start wordt eerst de kluiskeuze getoond. Benoemde workspaces krijgen een versleutelde workspace-ID in elk domeinbestand; bestanden uit een andere namespace worden ook bij gelijke wachtwoorden geweigerd. Online heropenen valideert de workspace-identiteit en behoudt latere remote wijzigingen. Workspace-vaultinstanties worden bij wisselen en resetten expliciet vrijgegeven, zodat dezelfde administratie later opnieuw kan worden geopend zonder dubbele opslagprefixen. De standaardadministratie behoudt de oude prefixes, passkey-identificaties, paden en payloadstructuur. CI #627 op head `7eb883706f8fa1b6bae8b8fbbd31a25bcec97c81` is volledig groen: 125/125 tests. #623 had één onjuiste testverwachting in de synthetische mergeproef; de test is gecorrigeerd en de daaropvolgende workflows zijn geslaagd. Geen merge, Pages-deployment of productiegegevenswijziging uitgevoerd.

- **16 nov 2026 – PR #10 schone start:** aparte `initializeEmpty`-route toegevoegd. Deze maakt of opent uitsluitend lege shared + actieve persoonlijke Core-kluis, valideert lokale en remote inhoud en controleert na synchronisatie de remote bevestiging. Legacydata wordt niet gelezen of geïmporteerd; een lokale marker voorkomt latere automatische legacy-merge. Oude bestanden worden niet verwijderd. Synthetische tests toegevoegd voor eerste apparaat, tweede apparaat, profielspecifieke kluis, niet-lege data, verkeerd wachtwoord en uploadfout. CI nog af te wachten.

- **16 nov 2026 – PR #9 acceptatie:** CR05 en aanvullende conflictkeuze-/UI-tests zijn geautomatiseerd. V05 (verkeerd wachtwoord, verkeerd domein en beschadigde remote ciphertext) en S06 (remote HTTP 500 en expliciete retry) toegevoegd. Vervolgens S03, S04 en S07 uitgebreid van losse merge-/ledgerproeven naar de echte Core-vault-/syncclientroute met twee onafhankelijke synthetische clients en mock GitHub Contents API. S03 slaagt in beide uploadvolgordes met identieke conflict-ID; S04 voorkomt herleving van een ouder offline record; S07 controleert device-acknowledgement en tombstone-opruiming. CI #467 op head `7a9f6766`: 89/89 geslaagd. S03/S04/S07 en V05 zijn PASS voor synthetische tests; S06 blijft PARTIAL omdat UI-foutzichtbaarheid en fysieke netwerkuitval niet zijn getest. Geen productiegegevens of productietokens gebruikt.

- **14 nov 2026:**
  - PWA-Core v1.1.0 lokaal vastgepind en geprecachet.
  - Drie onafhankelijke Core-kluizen en veilige legacy-migratie voorbereid.
  - Runtime-integratie toegevoegd aan `index.html`: Core-mode, wachtwoordontgrendeling, offline werking, synchronisatie, passkeybeheer, wachtwoordwijziging en versieherstel.
  - Migratie zet de legacy-updatebarrière pas na succesvolle legacy-sync en verwijdert lokale plaintext pas na bevestiging van beide Core-kluizen.
  - CI #244 op PR-head `d307d9aa`: 41/41 tests geslaagd, 0 overgeslagen; Core-modulecontrole, inline app-JavaScript, release-pin en service-worker-precache groen. Expliciete lokale ontgrendeling is toegevoegd.
  - PR #5 is later gemerged; zie de actuele status bovenaan dit bestand.
- **15 nov 2026:**
  - Biometrische bundelcryptografie verplaatst naar app-eigen module; Core v1.1.0-bestanden zijn ongewijzigd en pinvalidatie slaagt.
  - Echte Web Crypto-wrap/unwrap en gesimuleerde WebAuthn PRF-enrollment/ontgrendeling toegevoegd als regressietests.
  - `backup/` uitgesloten van Pages en app-bundelmodule toegevoegd aan service-worker-precache.
  - CI #263 op PR-head `a9f5c4bcc0399fe6107299cf2b5e451af86817ad`: 43/43 tests geslaagd; release-pin en precache groen.
  - Beveiligingsreview vond dat de nieuwe device-bundel bestaande passkeys uit de Core-domeinen ten onrechte als andere app afwees. De toegestane userHandle-prefixen zijn beperkt uitgebreid tot gedeeld + de actieve persoonlijke kluis; een andere persoonlijke kluis blijft geweigerd.
  - CI #282/#283 op PR-head `68fe44f17b6da48d1092b8861bfba044033bffca`: 45/45 tests geslaagd, inclusief directe WebAuthn-herkoppelingstest; Core-pin en precache opnieuw groen.

- Extra reviewronde: handmatig vergrendelen wacht nu op alle reeds gestarte `persistState`-bewerkingen. Een niet-herstelde opslagfout blokkeert ook `flushLocal()` en `lock()`; een latere volledige succesvolle opslag heft de fout op. Twee regressietests toegevoegd; CI #300/#301: 47/47 geslaagd.
- Handmatige acceptatiechecklist toegevoegd aan `docs/PWA-CORE-MIGRATION.md`; deze is nog niet uitgevoerd. De migratie staat inmiddels op `main` en de Pages-deploymentworkflow is geslaagd, maar fysieke acceptatie en een geïsoleerde testdeploy moeten nog plaatsvinden.


- **16 nov 2026 – fysieke acceptatie PR #9:** gebruiker heeft de afgesproken praktijktest op iPhone Safari en Windows 11 Edge uitgevoerd en teruggekoppeld dat alles goed is gegaan. Vastgelegd als PASS voor de uitgevoerde scope: gedeelde en eigen persoonlijke kluis toegankelijk, persoonlijke kluis van de andere gebruiker afgeschermd, synchronisatie tussen twee fysieke apparaten, offline wijziging tegenover online verwijdering zonder herleving van het verwijderde record, en biometrisch vergrendelen/ontgrendelen op beide apparaten. Dit is gebruikersgerapporteerd bewijs, geen CI-waarneming en geen volledige afvinking van alle S01–S07/V01–V06/CR01–CR09-scenario's. PR #9 blijft open/draft/ongemerged; productie blijft onaangeroerd.


## 3.3.0 – Kluiskeuze zonder GitHub Sync (featurebranch)

- Branch: `feat/vault-choice-without-github-sync`.
- Zonder synchronisatiekoppeling toont de app eerst een expliciete kluiskeuze: een bestaande kluis koppelen via de synchronisatie-instellingen, of een nieuwe lokale kluis aanmaken.
- De lokale route maakt twee afzonderlijke PWA-Core-kluizen aan (gedeeld + persoonlijk), versleuteld in lokale opslag. Er wordt geen GitHub-client aangeroepen en er wordt niets naar een remote repository geschreven.
- Een lokale start importeert geen legacygegevens. De bestaande `vastelasten.v2`-gegevens blijven onaangeroerd maar worden niet automatisch in de nieuwe Core-kluizen gemengd.
- Een bestaande niet-lege Core-kluis wordt geweigerd; bij gedeeltelijk succes blijft de eerder aangemaakte lege kluis behouden zodat opnieuw proberen mogelijk is.
- Lokale-only kluizen zijn apparaatgebonden; synchronisatie naar andere apparaten is niet beschikbaar totdat een afzonderlijke veilige koppel-/publicatieroute is geïmplementeerd.
- Geautomatiseerde tests toegevoegd voor lokale aanmaak, heropenen, afwezigheid van remote writes en weigeren van niet-lege lokale kluizen.
- Nog te verifiëren: volledige CI, inline JavaScript-syntax, fysieke acceptatie op iPhone Safari en Windows 11 Edge. Geen merge of Pages-deployment uitgevoerd.


## 3.4.0 – lokale kluis koppelen aan GitHub Sync (featurebranch)

- Branch: `feat/connect-local-core-to-github-sync`.
- Nieuwe runtime-route publiceert de bestaande lokale shared + actieve persoonlijke Core-kluis naar een privérepository zonder de kluizen opnieuw aan te maken of gegevens te overschrijven.
- Remote Core-bestanden worden vóór de eerste upload allemaal gecontroleerd. Een bestaand bestand is alleen toegestaan als de SHA lokaal al bevestigd is en de inhoud met de bestaande lokale datasleutel kan worden ontsleuteld. Onbekende of afwijkende bestanden stoppen de koppeling.
- Een mislukte gedeeltelijke publicatie kan worden hervat: reeds gepubliceerde bestanden worden aan de hand van hun bevestigde SHA gecontroleerd; ontbrekende bestanden worden daarna gepubliceerd.
- Een nieuwe installatie kan rechtstreeks een bestaande PWA-Core-kluis koppelen. De gedeelde kluis moet bestaan; de persoonlijke kluis van de gekozen gebruiker wordt geïmporteerd of, als die nog niet bestaat, leeg aangemaakt. Legacybestanden in de root worden niet gelezen of gewijzigd.
- De GitHub-token blijft via de bestaande versleutelde IndexedDB-opslag bewaard. Alleen private repositories worden geaccepteerd.
- Toegevoegd aan de synthetische runtime-tests: publiceren met behoud van gegevens, weigeren van onbekende remote bestanden, verkeerd wachtwoord, hervatten na gedeeltelijke upload, tweede apparaat met ontbrekende persoonlijke kluis en import van bestaande niet-lege gedeelde gegevens.
- Nog te verifiëren: volledige CI, browser-/UI-syntax en fysieke acceptatie op iPhone Safari en Windows 11 Edge. Geen merge, Pages-deployment of wijziging van productiegegevens uitgevoerd.
