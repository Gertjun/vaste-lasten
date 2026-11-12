# NOTES – Vaste Lasten

De **actuele stand**: versie, open punten en sessielog. Werk dit bij aan het eind van elke sessie (zie `CLAUDE.md`). Besluiten staan in `DECISIONS.md`, wensen in `WISHLIST.md`.

Laatst bijgewerkt: 12 november 2026 · versie **2.29.3**

---

## 1. Werkwijze
Zie `CLAUDE.md`.

## 2. Stand
PWA voor vaste lasten, samen met Wies. Gezamenlijke lasten in `samen.json`, eigen lasten per persoon in `eigen-<p>.json`, elk met een eigen wachtwoord versleuteld in een privé-repo. Gebruikt op laptop, iPhone en iPad.

## 3. Open punten en bekende problemen
- Er staat op de fase-2-branch een losse `prf-test.html` om WebAuthn PRF en herstel met een tijdelijke passkey te testen. Deze pagina gebruikt geen productiegegevens en is nog niet op GitHub Pages gepubliceerd. Test op iPhone/Safari, iPad/Safari en laptopbrowser; leg browser- en OS-versies vast.
- Lokale gegevens staan nog als leesbare JSON in `localStorage`; versleuteling daarvan is een apart open beveiligingspunt. Ontwerp dit samen met Wishlist #6 (Face ID/passkey), zodat herstel na herinstallatie en gebruik op meerdere apparaten behouden blijven.
- Wishlist #6 Vergrendelen met Face ID: bouwen met de standaardaanpak van de andere apps (vaste PRF-invoer, bestaande passkey kiezen na opnieuw installeren).
- Later: native iPhone-app; updates moeten dan in zowel de native als de PWA-versie terechtkomen.

## 4. Sessielog (kort, nieuwste bovenaan)

- **12 nov 2026:**
  - 2.29.3: fout in ingebedde changelog hersteld; CI controleert JSON-structuur en JavaScript-syntaxis. Losse PRF-hersteltest toegevoegd; productiegegevensopslag is nog niet gewijzigd.

- **12 nov 2026:**
  - 2.29.2: GitHub-token uit leesbare configuratie gehaald; lokaal versleuteld opgeslagen in IndexedDB. Migratie voor bestaande koppelingen en tests toegevoegd.

- **12 nov 2026:**
  - 2.29.1: synchronisatie geeft nu expliciet een fout na vier onbevestigde GitHub-schrijfconflicten; gerichte tests toegevoegd.

- **10 nov 2026:**
  - 2.29.0: nieuwe wachtwoorden met 600.000 PBKDF2-rondes, zoals de andere apps; elk bestand onthoudt zijn eigen aantal (`kdf.iter`). CLAUDE.md, NOTES en DECISIONS toegevoegd.
