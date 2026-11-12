# DECISIONS – Vaste Lasten

Besluiten die een volgende sessie moet kennen. Oude besluiten pas je niet aan; een nieuw besluit vervangt een oud ("vervangt D3").

### D1 – Gezamenlijk en eigen apart versleuteld (okt 2026)
- **Besluit:** twee soorten bestanden: `samen.json` met het gezamenlijke wachtwoord, en per persoon `eigen-<p>.json` met een eigen wachtwoord.
- **Waarom:** eigen lasten blijven onzichtbaar voor de partner; alles blijft geheim voor de buitenwereld.

### D2 – Inkomens zijn gedeeld (nov 2026, 2.28.0)
- **Besluit:** ingevulde inkomens staan in het gezamenlijke bestand; de app rekent het aandeel in de gezamenlijke lasten uit op basis van wat ieder overmaakt (ieder 75% van het netto-inkomen). Eigen vaste lasten = die bijdrage plus eigen kosten, niet het aandeel in de gezamenlijke lasten.
- **Waarom:** Geert en Wies kennen elkaars inkomen al.

### D3 – Elke wijziging een versie (okt 2026)
- **Besluit:** eigen versienummer per wijziging, met changelog, wishlist en het versienummer in de bestandsnaam van een download.

### D4 – Claude pusht zelf (okt 2026)
- **Besluit:** Claude haalt de code aan het begin uit `Gertjun/vaste-lasten` en pusht nieuwe versies zelf naar `main`.

### D5 – PBKDF2 600.000 rondes voor nieuwe wachtwoorden (10 nov 2026, 2.29.0)
- **Besluit:** nieuwe salts (wachtwoord wijzigen, nieuwe koppeling) gebruiken 600.000 rondes; bestaande bestanden houden 310.000 tot het wachtwoord gewijzigd wordt. Het aantal staat per bestand in `kdf.iter` en per apparaat in `cfg.iter`.
- **Waarom:** gelijk beveiligingsniveau als de andere apps, zonder dat Wies' apparaat meteen moet bijwerken. Alleen bij een wachtwoordwijziging moet het andere apparaat eerst bijgewerkt zijn.

### D6 – Synchronisatie moet falen zonder bevestigde opslag (12 nov 2026, 2.29.1)
- **Besluit:** na vier mislukte schrijfconflicten geeft `syncStore()` een foutmelding. De app mag de status Gesynchroniseerd alleen tonen wanneer de gegevens aantoonbaar gelijk zijn aan GitHub of de schrijfactie is bevestigd.
- **Waarom:** een niet-bevestigde wijziging mag nooit als succesvol gesynchroniseerd worden gepresenteerd.


### D7 – GitHub-token lokaal versleuteld bewaren (12 nov 2026, 2.29.2)
- **Besluit:** de GitHub-token staat niet in de leesbare configuratie in `localStorage`, maar wordt met AES-GCM versleuteld in IndexedDB bewaard. De encryptiesleutel is niet-exporteerbaar en staat apart in IndexedDB. Bestaande koppelingen migreren automatisch; ontkoppelen wist beide records.
- **Waarom:** voorkomen dat de token bij gewone inspectie van `localStorage` direct zichtbaar is. Dit beschermt niet tegen kwaadaardige scripts die binnen dezelfde oorsprong draaien; IndexedDB en de sleutel zijn dan via de app-context te gebruiken.


### D8 – Lokale gegevensversleuteling vereist herstelontwerp (12 nov 2026)
- **Status:** nog geen implementatiebesluit.
- **Uitgangspunt:** de bestaande `localStorage`-kopie van de lasten is leesbaar en moet uiteindelijk versleuteld worden. De gezamenlijke en eigen gegevens moeten hun afzonderlijke vertrouwelijkheid behouden.
- **Randvoorwaarden:** herstel na verwijderen/herinstalleren, meerdere apparaten, iOS/iPadOS en laptop, gebruik door twee personen, offline gebruik, bestaande back-ups en veilige migratie zonder gegevensverlies.
- **Voorkeursrichting voor onderzoek:** willekeurige gegevenssleutels per gegevensdeel, versleuteld met een sleutel die via WebAuthn PRF/passkey kan worden afgeleid; daarnaast een expliciete herstelroute. Eerst browserondersteuning en credential-sync testen. Geen passkey of PRF als enige kopie van een sleutel zonder herstelmechanisme.
- **Beveiligingsgrens:** encryptie met een sleutel die alleen in dezelfde browser-origin opgeslagen is, verbergt gegevens niet voor kwaadaardige scripts op die origin. Een CSP en het verwijderen/zelf hosten van dynamische externe scripts moeten als aparte beveiligingsmaatregelen worden onderzocht.


### D9 – PRF eerst per browser testen, geen productieafhankelijkheid (12 nov 2026)
- **Besluit:** WebAuthn PRF wordt eerst getest met een aparte pagina en een tijdelijke passkey. De test mag geen productiegegevens, GitHub-token of bestaande synchronisatiesleutels benaderen. Er wordt pas een productiesleutelarchitectuur gekozen nadat herstel aantoonbaar werkt op iPhone/Safari, iPad/Safari en de laptopbrowser.
- **Waarom:** PRF-ondersteuning en passkey-synchronisatie hangen af van browser, platform en authenticator. Een passkey die alleen op één apparaat werkt mag niet de enige manier worden om de lokale lasten te herstellen.
