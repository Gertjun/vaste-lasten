# NOTES – Vaste Lasten

De **actuele stand**: versie, open punten en sessielog. Werk dit bij aan het eind van elke sessie (zie `CLAUDE.md`). Besluiten staan in `DECISIONS.md`, wensen in `WISHLIST.md`.

Laatst bijgewerkt: 16 november 2026 · versie **3.1.1 in voorbereiding** (bugfix in PR #9).

---

## 1. Werkwijze

Zie `CLAUDE.md`. De multi-vault-integratie is via PR #5 gemerged naar `main`. Vervolgwijzigingen lopen via afzonderlijke branches/PR's. Geen productiegegevensmigratie of productie-write zonder expliciet akkoord.

## 2. Stand

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

Laatste geverifieerde PR #9-code-/test-head `7a9f67664bb8e8a02780d6dcb3ba03f1da7d0af9`: CI **#467**, 89 tests geslaagd, 0 mislukt, 0 overgeslagen. Core-modulecontrole, inline app-JavaScript, release-pin en service-worker-precache zijn groen. S01/S02 en nu ook S03/S04/S07 zijn via de echte Core-vault-/syncclientcode met twee onafhankelijke synthetische clients en een mock GitHub Contents API getest; S03 controleert beide uploadvolgordes, S04 een oudere offline bewerking tegenover een nieuwere verwijdering en S07 device-acknowledgement plus tombstone-opruiming. V05 blijft PASS; S06 blijft PARTIAL (UI-foutzichtbaarheid en fysieke netwerkuitval niet getest). De volledige browser-/apparaatacceptatie en productiegegevensmigratie zijn NIET UITGEVOERD.

## 3. Open punten

1. Browser-/apparaatacceptatie van de volledige Vaste Lasten-runtime, waaronder één biometrische actie voor twee actieve kluizen, wachtwoordmigratie, herstel en twee apparaten.
2. S01–S07 sync-/concurrencyacceptatie met twee onafhankelijke synthetische clients, inclusief gedeelde en persoonlijke domeinen.
3. Fysieke browser-/apparaatacceptatie van de echte WebAuthn PRF-integratie; de statische diff-/beveiligingsreview is uitgevoerd en een race bij vergrendelen is opgelost.
4. Geïsoleerde synthetische acceptatie uitvoeren vóór enige echte data-cutover. De integratie is al gemerged en de Pages-deploymentworkflow is geslaagd; een echte productiegegevensmigratie blijft afzonderlijk geblokkeerd. Geen test gebruikt de echte privé-datarepository, tokens, passkeys of productiegegevens.

Geen echte privé-datarepository, productie-token, echte passkey of productiegegevens gebruikt tijdens ontwikkeling en tests.

## 4. Sessielog

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
