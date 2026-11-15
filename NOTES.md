# NOTES – Vaste Lasten

De **actuele stand**: versie, open punten en sessielog. Werk dit bij aan het eind van elke sessie (zie `CLAUDE.md`). Besluiten staan in `DECISIONS.md`, wensen in `WISHLIST.md`.

Laatst bijgewerkt: 15 november 2026 · versie **3.0.0 in voorbereiding** (draft PR #5; nog niet gemerged of gedeployed).

---

## 1. Werkwijze

Zie `CLAUDE.md`. Wijzigingen blijven op `feat/pwa-core-multi-vault-migration` totdat de volledige integratie, tests en review zijn afgerond. Geen merge, Pages-deploy of echte datamigratie zonder expliciet akkoord.

## 2. Stand

Vaste Lasten gebruikt op de migratiebranch PWA-Core v1.1.0 als vastgepinde, meegeleverde basis. De Core-modules worden door de service worker geprecachet; de app haalt tijdens gebruik geen Core-code op uit de Core-repository.

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

Laatste geverifieerde code-/test-head `c59f24ae9df151a427b92b7e6173f3692a00680b`: CI **#300 en #301**, 47 tests geslaagd, 0 mislukt, 0 overgeslagen. Core-modulecontrole, inline app-JavaScript, exacte releasepin (18 bestanden) en service-worker-precache (29 entries) zijn geslaagd. De passkey-herkoppeling accepteert nu de eigen gedeelde en persoonlijke Core-passkeys en weigert de persoonlijke passkey van de andere gebruiker. `backup/` is uitgesloten van Pages-publicatie. De fysieke B07-acceptatietest blijft uitgesteld totdat de migraties van alle apps klaar zijn.

## 3. Open punten

1. Browser-/apparaatacceptatie van de volledige Vaste Lasten-runtime, waaronder één biometrische actie voor twee actieve kluizen, wachtwoordmigratie, herstel en twee apparaten.
2. B07 fysieke acceptatietests op iPhone/iPad, samen met de andere apps.
3. Fysieke browser-/apparaatacceptatie van de echte WebAuthn PRF-integratie; de statische diff-/beveiligingsreview is uitgevoerd en een race bij vergrendelen is opgelost.
4. Daarna pas versie 3.0.0 gereedmaken voor merge/deploy; daarvoor is apart akkoord nodig.

Geen echte privé-datarepository, productie-token, echte passkey of productiegegevens gebruikt tijdens ontwikkeling en tests.

## 4. Sessielog

- **14 nov 2026:**
  - PWA-Core v1.1.0 lokaal vastgepind en geprecachet.
  - Drie onafhankelijke Core-kluizen en veilige legacy-migratie voorbereid.
  - Runtime-integratie toegevoegd aan `index.html`: Core-mode, wachtwoordontgrendeling, offline werking, synchronisatie, passkeybeheer, wachtwoordwijziging en versieherstel.
  - Migratie zet de legacy-updatebarrière pas na succesvolle legacy-sync en verwijdert lokale plaintext pas na bevestiging van beide Core-kluizen.
  - CI #244 op PR-head `d307d9aa`: 41/41 tests geslaagd, 0 overgeslagen; Core-modulecontrole, inline app-JavaScript, release-pin en service-worker-precache groen. Expliciete lokale ontgrendeling is toegevoegd.
  - PR #5 blijft draft; geen merge of deploy uitgevoerd.
- **15 nov 2026:**
  - Biometrische bundelcryptografie verplaatst naar app-eigen module; Core v1.1.0-bestanden zijn ongewijzigd en pinvalidatie slaagt.
  - Echte Web Crypto-wrap/unwrap en gesimuleerde WebAuthn PRF-enrollment/ontgrendeling toegevoegd als regressietests.
  - `backup/` uitgesloten van Pages en app-bundelmodule toegevoegd aan service-worker-precache.
  - CI #263 op PR-head `a9f5c4bcc0399fe6107299cf2b5e451af86817ad`: 43/43 tests geslaagd; release-pin en precache groen.
  - Beveiligingsreview vond dat de nieuwe device-bundel bestaande passkeys uit de Core-domeinen ten onrechte als andere app afwees. De toegestane userHandle-prefixen zijn beperkt uitgebreid tot gedeeld + de actieve persoonlijke kluis; een andere persoonlijke kluis blijft geweigerd.
  - CI #282/#283 op PR-head `68fe44f17b6da48d1092b8861bfba044033bffca`: 45/45 tests geslaagd, inclusief directe WebAuthn-herkoppelingstest; Core-pin en precache opnieuw groen.

- Extra reviewronde: handmatig vergrendelen wacht nu op alle reeds gestarte `persistState`-bewerkingen. Een niet-herstelde opslagfout blokkeert ook `flushLocal()` en `lock()`; een latere volledige succesvolle opslag heft de fout op. Twee regressietests toegevoegd; CI #300/#301: 47/47 geslaagd.
- Handmatige acceptatiechecklist toegevoegd aan `docs/PWA-CORE-MIGRATION.md`; deze is nadrukkelijk nog niet uitgevoerd omdat de branch niet is gedeployed.
