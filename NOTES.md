# NOTES – Vaste Lasten

De **actuele stand**: versie, open punten en sessielog. Werk dit bij aan het eind van elke sessie (zie `CLAUDE.md`). Besluiten staan in `DECISIONS.md`, wensen in `WISHLIST.md`.

Laatst bijgewerkt: 14 november 2026 · versie **3.0.0 in voorbereiding** (draft PR #5; nog niet gemerged of gedeployed).

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
- passkey opnieuw koppelen na herinstallatie, per kluis;
- behoud van Core-deletion/device metadata tijdens app-saves;
- bescherming tegen het opnieuw publiceren van ontbrekende remote kluizen;
- herstel van lokale wijzigingen bij een remote wachtwoordwijziging;
- CI-controle op Core-modules, de volledige inline app-JavaScript, release-pin, service-worker-precache en tests.

Laatste geverifieerde CI-run: **#190**, 39 tests geslaagd, 0 mislukt. De fysieke B07-acceptatietest blijft uitgesteld totdat de migraties van alle apps klaar zijn.

## 3. Open punten

1. Browser-/apparaatacceptatie van de volledige Vaste Lasten-runtime, waaronder twee afzonderlijke passkeyprompts, wachtwoordmigratie, herstel en twee apparaten.
2. B07 fysieke acceptatietests op iPhone/iPad, samen met de andere apps.
3. Laatste diffreview en documentatiecontrole.
4. Daarna pas versie 3.0.0 gereedmaken voor merge/deploy; daarvoor is apart akkoord nodig.

Geen echte privé-datarepository, productie-token, echte passkey of productiegegevens gebruikt tijdens ontwikkeling en tests.

## 4. Sessielog

- **14 nov 2026:**
  - PWA-Core v1.1.0 lokaal vastgepind en geprecachet.
  - Drie onafhankelijke Core-kluizen en veilige legacy-migratie voorbereid.
  - Runtime-integratie toegevoegd aan `index.html`: Core-mode, wachtwoordontgrendeling, offline werking, synchronisatie, passkeybeheer, wachtwoordwijziging en versieherstel.
  - Migratie zet de legacy-updatebarrière pas na succesvolle legacy-sync en verwijdert lokale plaintext pas na bevestiging van beide Core-kluizen.
  - CI #190: 39/39 tests geslaagd; inline app-JavaScript syntaxiscontrole, release-pin en service-worker-precache groen.
  - PR #5 blijft draft; geen merge of deploy uitgevoerd.
