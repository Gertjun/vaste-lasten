# DECISIONS – Vaste Lasten

### D16 – Stapsgewijs inloggen in Vaste Lasten (18 nov 2026)
- **Besluit:** het vergrendelscherm vraagt eerst uitsluitend om het persoonlijke wachtwoord. Pas na een geslaagde controle wordt het gezamenlijke wachtwoord gevraagd. De normale sessie opent daarna nog steeds beide actieve kluizen als één sessie. De laatst gebruikte administratie wordt direct voorgeselecteerd; **Andere kluis kiezen** en **Nieuwe kluis** blijven beschikbaar als secundaire acties.
- **Controle:** de eerste stap ontsleutelt alleen de persoonlijke lokale of remote envelope in geheugen. Ze importeert, schrijft of opent geen kluis en benadert het gezamenlijke domein niet. Een bestaande passkey blijft beide actieve kluizen in één handeling ontgrendelen.
- **Waarom:** een rustiger, uniformer startscherm zonder wachtwoorden samen te voegen of de privacygrens tussen gezamenlijk en persoonlijk te verzwakken.


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


### D8 – Schone start zonder legacy-import (16 nov 2026, 3.2.0 in voorbereiding)
- **Besluit:** Vaste Lasten wordt voor de nieuwe start opgebouwd uit drie lege PWA-Core-kluizen. Het eerste apparaat maakt shared + eigen aan; het tweede apparaat sluit aan op shared en maakt alleen de eigen persoonlijke kluis aan.
- **Waarom:** de gebruiker voert de lasten opnieuw handmatig in. Oude lokale en remote legacygegevens worden niet gemigreerd. Ze blijven behouden tot beide apparaten en de drie nieuwe kluizen zijn gecontroleerd; opruiming gebeurt daarna afzonderlijk.
- **Veiligheidsgrens:** bestaande niet-lege Core-kluizen worden geweigerd. Geen automatische reset, overschrijving of legacy-import.


### D8 – Eerst expliciet een kluis kiezen (16 nov 2026, 3.3.0)
- **Besluit:** zonder actieve GitHub Sync toont Vaste Lasten eerst een kluiskeuze: een bestaande kluis koppelen via synchronisatie-instellingen of een nieuwe lokale PWA-Core-kluis aanmaken.
- **Besluit:** een lokale-only kluis bestaat uit een afzonderlijke gedeelde en persoonlijke Core-kluis, beide versleuteld op dit apparaat. Ze synchroniseren niet automatisch naar andere apparaten.
- **Veiligheid:** een lege start leest of importeert geen oude legacygegevens en weigert bestaande niet-lege Core-kluizen; gedeeltelijk aangemaakte lege kluizen blijven hervatbaar.


### D9 – Lokale Core-kluis veilig aan GitHub koppelen (17 nov 2026, 3.4.0)
- Besluit: een lokale-only kluis wordt niet opnieuw aangemaakt bij koppelen. De bestaande versleutelde kluisbestanden worden met hun bestaande datasleutels gepubliceerd.
- Veiligheid: een remote Core-bestand mag alleen worden hergebruikt als de SHA al lokaal als eigen publicatie is bevestigd en het bestand met de lokale datasleutel kan worden ontsleuteld. Onbekende of afwijkende remote bestanden worden geweigerd; ze worden niet samengevoegd of overschreven.
- Hervatten: na een gedeeltelijke upload mag de gebruiker opnieuw proberen; reeds bevestigde bestanden worden gecontroleerd en ontbrekende bestanden gepubliceerd.
- Tweede apparaat: de gedeelde remote kluis is verplicht; alleen de gekozen persoonlijke kluis wordt geïmporteerd of, als die nog niet bestaat, leeg aangemaakt. Legacybestanden blijven onaangeraakt.


### D10 – Herstelroute vanaf het Core-vergrendelscherm (17 nov 2026, 3.5.0)
- **Besluit:** vanaf het vergrendelscherm is het altijd mogelijk terug te keren naar de kluisinstellingen, ook als de huidige wachtwoorden niet meer werken.
- **Veiligheid:** alleen teruggaan naar instellen wist niets. Het vervangen van lokale Core-kluizen vereist een afzonderlijke bevestiging en wist uitsluitend de lokale drie Core-kluizen plus de lokale passkey-koppeling op dat apparaat. Remote GitHub-bestanden en gegevens op andere apparaten blijven onaangeroerd.
- **Waarom:** een gebruiker mag niet permanent vastlopen op een vergrendelscherm wanneer een wachtwoord of repositorykoppeling niet meer werkt.


### D11 – Meerdere benoemde gegevenskluizen (17 nov 2026, 3.6.0)
- **Besluit:** de gebruiker kan meerdere administraties naast elkaar bewaren en kiezen op naam. Iedere administratie bevat intern dezelfde drie domeinen: gezamenlijk, persoonlijk p1 en persoonlijk p2.
- **Opslag:** lokale administraties krijgen per workspace een eigen lokale opslagprefix. Online administraties krijgen per workspace een eigen padnamespace in de gekozen privérepository en een deelbare kluiscode om dezelfde administratie op een ander apparaat te koppelen.
- **Compatibiliteit:** de bestaande standaardadministratie blijft op de bestaande lokale prefixes en GitHub-paden staan; de profielnaam en workspace-identificatie veranderen de cryptografische sleutels of bestaande ciphertext niet.
- **Herstel:** teruggaan naar de kluiskeuze wist niets. Een bevestigde lokale reset is beperkt tot de gekozen workspace op dit apparaat; andere workspaces en remote bestanden blijven behouden.


### D12 – Workspace-identiteit en administratiekeuze bij opstarten (17 nov 2026, PR #13)
- **Keuze:** bij iedere nieuwe app-start toont de PWA eerst de lijst met bestaande administraties. De laatst gebruikte administratie wordt niet automatisch geopend; de gebruiker kiest expliciet.
- **Identiteit:** benoemde workspaces bewaren hun workspace-ID ook als metadata binnen de versleutelde domeinpayload. Bij openen, koppelen, synchroniseren en hervatten wordt gecontroleerd of de payload bij de gekozen workspace hoort.
- **Compatibiliteit:** de standaardadministratie behoudt de bestaande payloadstructuur zonder workspace-ID. Namen blijven uitsluitend presentatiemetadata en worden niet gebruikt voor sleutelafleiding.
- **Veiligheid:** een bestand dat onder een andere workspace-namespace terechtkomt, wordt geweigerd, ook wanneer de wachtwoorden toevallig gelijk zijn. Er wordt niets naar de remote repository geschreven.
- **Runtimebeheer:** bij het wisselen of resetten worden de drie workspacegebonden vault-instanties expliciet vrijgegeven. Lokale gegevens blijven bij gewoon wisselen behouden; de opslagprefixen kunnen daarna veilig opnieuw worden geopend.


### D13 – Back-upherstel bevestigt Core-opslag (17 nov 2026)
- **Besluit:** het terugzetten van een back-up in PWA-Core bouwt eerst een afzonderlijke nieuwe state op en wacht daarna op `persistState` én `flushLocal` voor de twee actieve kluizen.
- **Succesmelding:** de app meldt pas dat de back-up lokaal is opgeslagen nadat beide opslagbewerkingen zijn bevestigd. Online synchronisatie volgt via de bestaande synchronisatieroute; lokale opslag wordt niet voorgesteld als remote bevestiging.
- **Foutafhandeling:** een opslagfout wordt niet als ongeldige back-up gemeld. Bij een mogelijke gedeeltelijke opslag blijft de Core-runtime leidend en wordt de fout expliciet getoond; de gebruiker houdt de kluizen ontgrendeld en kan opnieuw proberen.


### D14 – QR-koppeling tussen apparaten (17 nov 2026, 3.7.0 in voorbereiding)
- **Besluit:** een tweede apparaat mag de bestaande benoemde PWA-Core-workspace via een QR-code koppelen. De QR-code draagt de workspace-identiteit, administratienaam, GitHub-eigenaar/repository, gebruikersrol en GitHub-token over.
- **Beveiliging:** alle overdrachtsgegevens worden met AES-256-GCM versleuteld. De sleutel wordt met PBKDF2-SHA-256 (600.000 rondes) afgeleid uit beide kluiswachtwoorden plus een willekeurige salt. De QR-code bevat nooit leesbare wachtwoorden of token.
- **Geldigheid:** QR-codes verlopen na drie minuten en een nonce voorkomt hergebruik op hetzelfde ontvangende apparaat. Er is geen centrale server; daarom is dit geen globale eenmalige code. De code blijft alleen bruikbaar zolang hij geldig is en de twee wachtwoorden bekend zijn.
- **Opslag:** na koppelen wordt de GitHub-token opnieuw lokaal versleuteld opgeslagen met de bestaande apparaatspecifieke, niet-exporteerbare IndexedDB-sleutel. De QR-code bevat geen gegevens van de persoonlijke kluis van de andere gebruiker.
- **Grenzen:** koppelen importeert alleen de bestaande workspace via de bestaande fail-closed `connectExisting`-route. Bestaande lokale of remote kluizen worden niet gereset of overschreven; legacybestanden blijven onaangeraakt.


### D15 – WebAuthn-identificaties voor Vaste Lasten-bundels (17 nov 2026, 3.8.2)
- **Besluit:** de aparte Vaste Lasten-bundel gebruikt de gedeelde PWA-Core-functies voor compacte WebAuthn userHandles met expliciete scope `bundle`. Vault-passkeys blijven scope `vault` gebruiken.
- **Compatibiliteit:** bestaande Vaste Lasten-bundelpasskeys met een legacy `storagePrefix:`-handle of de eerder geïntroduceerde `vl1-<hash>:`-handle blijven herkenbaar. Herkoppelen accepteert alleen de eigen bundel, de actieve gedeelde kluis en de actieve persoonlijke kluis; de kluis van de andere persoon en andere apps blijven geweigerd.
- **Cryptografie:** PRF-label/zout, HKDF-context, credential-ID, opgeslagen wrappingrecord, bundelsleutel en bestaande kluis-DEK's worden niet gewijzigd of opnieuw afgeleid. De wijziging raakt uitsluitend de WebAuthn userHandle-identificatie en validatie.


### D16 – Gedeelde Core-apparaatkoppeling zonder kluisgegevens (18 november 2026)
- **Besluit:** Vaste Lasten gebruikt PWA-Core v1.3.0 `PWA-CORE-PAIR-2`. De QR-envelop bevat uitsluitend owner, repo, branch, path en token. De workspace-identiteit volgt uit het GitHub-pad; administratienaam en gebruikersrol worden op het ontvangende apparaat apart gekozen.
- **Gevolg:** gezamenlijke en persoonlijke wachtwoorden worden op het nieuwe apparaat afzonderlijk ingevoerd. Geen kluisinhoud, wachtwoord of rol wordt via de QR-code verstuurd. De drie gescheiden kluizen en toegangsgrenzen blijven intact.
- **Waarom:** de koppeling hoeft alleen GitHub Sync te configureren; de bestaande Core-connect-route haalt daarna de juiste versleutelde bestanden op en vraagt de lokale wachtwoorden.

### D17 – Documenten naar verleden, heden en toekomst (20 nov 2026)
- **Besluit:** vier bestanden houden de app bij. Heden: `README.md`, met een blok "Stand" (vervangt `NOTES.md`; geen sessielog meer). Toekomst: `ROADMAP.md`, de enige takenlijst (vervangt `WISHLIST.md`); punten houden hun nummer, ook in de app. Verleden: `CHANGELOG.md` (wat, met achter de versie de nummers van de gebouwde punten; de lijst "Gerealiseerd" vervalt) en `DECISIONS.md` (waarom). Een wijziging alleen aan deze documenten krijgt geen nieuwe appversie. Vervangt het deel van D3 over de wishlist. (Het commentaar bij `WISHLIST` in `index.html` noemt nog `WISHLIST.md`; dat gaat mee bij de volgende appversie.)
- **Waarom:** NOTES, WISHLIST en de changelog herhaalden elkaar en liepen uit de pas (NOTES noemde PR #30 en #31 niet). Dezelfde indeling geldt voor al Geerts projecten.
