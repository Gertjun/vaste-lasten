# NOTES – Vaste Lasten

De **actuele stand**: versie, open punten en sessielog. Werk dit bij aan het eind van elke sessie (zie `CLAUDE.md`). Besluiten staan in `DECISIONS.md`, wensen in `WISHLIST.md`.

Laatst bijgewerkt: 18 november 2026 · versie **3.8.4 in voorbereiding** (PWA-Core v1.2.2).

---

## Actuele stand – 18 november 2026

- `main` staat op `f4f0df8c7d92b6fd8fb635c9fd4a85ccda835567`; PR #22 en documentatie-PR #24 zijn gemerged. Featurebranch `feat/simplified-login-gate` bereidt versie **3.8.4** voor; nog niet gemerged of gedeployed.
- Het inlogscherm wordt stapsgewijs: eerst uitsluitend het persoonlijke wachtwoord read-only controleren via de lokale of remote persoonlijke envelope; daarna pas het gezamenlijke wachtwoord. De uiteindelijke Core-sessie blijft beide actieve kluizen gezamenlijk openen.
- Eén knop **Inloggen** kiest automatisch online synchroniseren of lokaal ontgrendelen. Passkey blijft één actie. De laatst gebruikte administratie opent direct; andere kluis kiezen en nieuwe kluis aanmaken zijn kleinere secundaire acties.
- Geen productiekluizen, privé-datarepository, tokens, passkeys of echte gegevens benaderd of gewijzigd.
- De Core-pin, module, manifest en service-worker-cache zijn bijgewerkt; de app-specifieke verwijder-/hercreatietests gebruiken de echte ingebedde `merge()` en het eigen gegevensformaat (`del` + recordtijd `u`).
- De gebruiker heeft op 18 november de fysieke synchronisatieacceptatie uitgevoerd op iPhone Safari en Windows 11 Edge: nieuwe last en wijziging synchroniseerden in beide richtingen; een verwijdering kwam op het andere apparaat aan.
- S06 is daarna aanvullend fysiek getest met netwerkuitval op de iPhone: lokaal opslaan gaf status “Alleen lokaal”; handmatig synchroniseren meldde “Geen verbinding met Github”; na netwerkherstel synchroniseerde de last naar Windows. Verwijderen op Windows synchroniseerde terug naar de iPhone. De gebruiker bevestigde alle stappen.
- Deze fysieke resultaten vullen de synthetische tests aan. Ze bewijzen de beschreven praktijkscope, niet de volledige S01–S07/V01–V06/CR01–CR09-matrix.
- Productiekluizen, privé-datarepository, tokens en echte gegevens zijn niet benaderd of gewijzigd. Productiegegevensmigratie blijft een afzonderlijk, niet-uitgevoerd traject waarvoor expliciet akkoord nodig is.

## 1. Werkwijze

Zie `CLAUDE.md`. De multi-vault-integratie is via PR #5 gemerged naar `main`. Vervolgwijzigingen lopen via afzonderlijke branches/PR's. Geen productiegegevensmigratie of productie-write zonder expliciet akkoord.

## 2. Actuele stand

- Appversie **3.8.4 in voorbereiding**, PWA-Core **v1.2.2** (immutable release).
- PR #22 (Core v1.2.2-integratie) en PR #23 (documentatie/acceptatiecorrectie) zijn gemerged.
- De fysieke synchronisatieproef op iPhone Safari en Windows 11 Edge is door de gebruiker bevestigd: aanmaken, wijzigen en verwijderen synchroniseerden tussen beide apparaten.
- S06 is aanvullend fysiek getest met netwerkuitval en herstel; de status bleef lokaal totdat de verbinding terug was en de synchronisatie opnieuw werd gestart.
- Dit bewijst alleen de expliciet beschreven praktijkscope. De volledige S01–S07-, V01–V06- en CR01–CR09-matrix is niet integraal afgevinkt.
- Productiegegevensmigratie is niet uitgevoerd en blijft afzonderlijk geblokkeerd. Ontwikkeltests gebruiken geen productiegegevens, tokens of privé-datarepository.


## 3. Open punten

1. De volledige passkey-/PRF-matrix is nog niet integraal fysiek afgevinkt, waaronder herinstallatie/herkoppeling en alle relevante browser-/apparaatcombinaties.
2. Aanvullende scenario's uit S01–S07, V01–V06 en CR01–CR09 zijn niet allemaal fysiek uitgevoerd. Zie `docs/SYNC-CONCURRENCY-ACCEPTANCE.md` voor het onderscheid tussen synthetisch bewijs, fysieke praktijktests en niet-uitgevoerde scenario's.
3. Productiegegevensmigratie is **niet uitgevoerd** en blijft afzonderlijk geblokkeerd. Geen productiegegevens, tokens of privé-datarepository gebruiken voor ontwikkeltests.

## 4. Sessielog
- **18 nov 2026 – eenvoudiger inlogscherm (3.8.4 in voorbereiding):** persoonlijke wachtwoordcontrole vóór de gezamenlijke wachtwoordvraag; read-only envelopevalidatie; één online/offline-loginactie; passkey blijft beide actieve kluizen in één handeling openen. Regressietests toegevoegd voor juiste/verkeerde persoonlijke wachtwoorden en remote-only kluizen. Nog niet gemerged of gedeployed.

- **18 nov 2026 – fysieke sync- en S06-acceptatie:** op iPhone Safari en Windows 11 Edge zijn nieuwe records, wijzigingen en verwijderingen tussen apparaten gesynchroniseerd. Aanvullend is netwerkuitval op de iPhone getest: lokaal opslaan toonde “Alleen lokaal”; een expliciete sync-poging toonde “Geen verbinding met Github”; na netwerkherstel werd de last op Windows zichtbaar. Verwijderen op Windows en synchroniseren liet de last ook op de iPhone verdwijnen. S06 is hiermee PASS voor de gecombineerde synthetische en beschreven fysieke scope; niet alle overige acceptatiescenario's zijn daarmee afgevinkt. Geen productiegegevens of tokens gebruikt.


- **18 nov 2026 – PWA-Core v1.2.2 (3.8.3 in voorbereiding):** appmodule `js/core/deletions.js`, lockbestand en manifest bijgewerkt naar de immutable Core-release. Diff-review wees uit dat Vaste Lasten voor lasten een eigen `del`/`u`-mergepad gebruikt; de generieke Core-test met `deleted`/`updatedAt` bewees dat app-pad niet. Die twee tests zijn verplaatst naar de karakterisatietest die de exacte `merge()` uit `index.html` uitvoert. Geen productiegegevens of bestaande kluizen aangeraakt.

- **17 nov 2026 – PWA-Core v1.2.1 WebAuthn-integratie (3.8.2, in voorbereiding):** Core v1.2.1 wordt vastgepind. De app-bundel gebruikt voortaan de Core-functies voor compacte WebAuthn-identificaties met scope `bundle`; oude `storagePrefix:`- en `vl1-...`-handles blijven expliciet toegestaan. Regressietests controleren lange workspaces, scope-isolatie en behoud van de bestaande PRF-invoer. Geen productiegegevens, passkeys of kluissleutels gewijzigd.

- **17 nov 2026 – PWA-Core v1.2.0-integratie (3.8.0, in voorbereiding):** release `v1.2.0` is gepubliceerd en immutable. Vaste Lasten krijgt de nieuwe Core-module `js/core/device-pairing.js`; de app-adapter beperkt zich tot het valideren van Vaste Lasten-profielgegevens en bindt de overdracht aan de context `vaste-lasten/device-pairing/v1`. Replaybescherming wordt pas na succesvolle kluiskoppeling vastgelegd. De featurebranch is nog niet gemerged; pin-, precache-, CI- en fysieke QR-acceptatie moeten nog slagen.


- **17 nov 2026 – QR-koppeling tweede apparaat (3.7.0):** featurebranch `feat/qr-device-pairing`. QR-overdracht versleutelt workspace, administratie, GitHub-repository, gebruikersrol en token met een sleutel die uit beide kluiswachtwoorden wordt afgeleid (PBKDF2-SHA-256, 600.000 rondes; AES-256-GCM). QR-code verloopt na drie minuten; nonce wordt lokaal als gebruikt gemarkeerd. De token wordt op het tweede apparaat via de bestaande opslagroute opnieuw met de apparaatspecifieke IndexedDB-sleutel versleuteld. QR-generator en scanner zijn lokaal meegeleverd en worden door de service worker gecachet. Tests en CI moeten nog worden uitgevoerd; geen echte wachtwoorden, tokens of productiegegevens gebruikt.


- **17 nov 2026 – diagnostiek workspace-identiteit (3.6.3):** de validatiefout toont nu domein, verwachte kluiscode en aangetroffen kluiscode (of expliciet dat die ontbreekt). Dit maakt onderscheid mogelijk tussen een oude lokale payload zonder workspaceId en een payload van een andere administratie. De controle blijft fail-closed; er vindt geen automatische correctie plaats. Regressietests controleren beide foutvarianten.

- **17 nov 2026 – workspace-identiteit bij back-upherstel (3.6.2):** oorzaak gevonden in `splitLegacyState`: bij benoemde administraties ontbrak `workspaceId` in de gedeelde en persoonlijke payload. `persistState` gaf daardoor een payload aan `mergeDomainPayload` die terecht als andere administratie werd geweigerd. Fix geeft de actuele domeinconfiguratie mee bij splitsen en bewaart de workspace-identiteit; standaardadministratie blijft zonder `workspaceId`. Regressietests toegevoegd voor beide gevallen. PR volgt na CI-controle. Geen echte back-up of productiegegevens gebruikt in tests.

- **17 nov 2026 – back-upherstel PWA-Core (3.6.1):** de import bouwt eerst een aparte snapshot op en wacht op `persistState` plus `flushLocal` voor beide actieve Core-kluizen. De succesmelding betreft lokale opslag; online synchronisatie loopt via de bestaande route. Opslagfouten worden onderscheiden van ongeldige back-ups en de Core-runtime blijft leidend bij mogelijk gedeeltelijk succes. Synthetische tests toegevoegd voor de merge, behoud van betaalhistorie/metadata, wachten op opslagbevestiging en foutafhandeling. PR #14 staat open voor review; CI-resultaten worden gecontroleerd. Geen echte back-up of productiegegevens gebruikt in tests.

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
