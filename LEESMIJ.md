# Vaste Lasten

Een installeerbare web-app om maandelijks terugkerende uitgaven bij te houden. Je onderscheidt **gezamenlijke** lasten (die je met je partner deelt) van **eigen** lasten. De app synchroniseert versleuteld via een privé GitHub-repository.

## Bestanden

| Bestand | Doel |
|---|---|
| `index.html` | De app zelf |
| `manifest.webmanifest` | Naam, kleuren en iconen voor installatie |
| `sw.js` | Service worker: laat de app offline werken |
| `version.json` | Het actuele versienummer; hiermee ziet de app dat er een update is |
| `CHANGELOG.md` | Alle versies en wat er per versie veranderde |
| `WISHLIST.md` | Ideeën voor volgende versies, bijgewerkt bij elke versie |
| `icon-*.png`, `apple-touch-icon.png` | App-iconen |

## Onderdelen

- **Overzicht** (startscherm): de stand van deze maand, de eerstvolgende afschrijvingen om af te vinken, jouw kosten met een jaargrafiek, de gezamenlijke rekening en de verdeling per categorie.
- **Maand**: de afvinklijst per maand, met *Nog te betalen* en *Betaald*.
- **Lasten**: al je vaste lasten per categorie, om toe te voegen en te bewerken.
- **Instellingen**: huishouden (namen en verdeling), dit apparaat en synchronisatie, back-up, en informatie over de app.

## Indeling per apparaat

De app past zich aan de schermbreedte aan, dus ook bij Split View op de iPad of een smaller laptopvenster.

- **iPhone**: één kolom, tabbladen in een balk onderin binnen bereik van je duim, grotere tikvlakken.
- **iPad staand**: samenvatting als brede band, *Nog te betalen* en *Betaald* naast elkaar, categorieën in twee kolommen.
- **iPad liggend en laptop**: vaste zijbalk met maand, samenvatting, navigatie en *Nieuwe last*; het werkvlak gebruikt twee tot drie kolommen.
- **Laptop-sneltoetsen**: `N` nieuwe last, `←` `→` vorige of volgende maand, `1` `2` `3` tabbladen, `Esc` sluit het formulier.

## Hoe de gegevens zijn verdeeld

In de privé-repository staan drie bestanden, die de app zelf aanmaakt:

| Bestand | Inhoud | Versleuteld met |
|---|---|---|
| `samen.json` | Gezamenlijke lasten, afvinken, namen en verdeling | Gezamenlijk wachtwoord (kennen jullie allebei) |
| `eigen-p1.json` | Eigen lasten van persoon 1 | Eigen wachtwoord van persoon 1 |
| `eigen-p2.json` | Eigen lasten van persoon 2 | Eigen wachtwoord van persoon 2 |

Ieder ziet dus de gezamenlijke lasten plus zijn of haar eigen lasten, maar niet die van de ander.

## 1. App publiceren (publieke repository)

1. Maak op GitHub een repository `vaste-lasten`, **Public**.
2. Upload alle bestanden uit deze map naar de hoofdmap van de repo.
3. Ga naar **Settings → Pages**, kies *Deploy from a branch*, branch `main`, map `/ (root)`, **Save**.
4. De app staat na een minuut op `https://<gebruikersnaam>.github.io/vaste-lasten/`.

Bijwerken van een eerdere versie: vervang `index.html` en `sw.js`.

## 2. Privé-repository voor de gegevens

1. Maak een repository `vaste-lasten-data`, **Private**, en vink *Add a README file* aan.
2. Had je al een oude koppeling? Dan bestaat deze repo al. Het oude bestand `vaste-lasten.json` kun je na het opnieuw koppelen verwijderen.

## 3. Tokens aanmaken (door de eigenaar van de repo)

Je partner heeft geen GitHub-account nodig. Jij maakt twee tokens aan, één voor jezelf en één voor je partner, zodat je ze los van elkaar kunt intrekken.

1. **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Naam: `Vaste Lasten – Geert` (de tweede: `Vaste Lasten – partner`). Vervaldatum: bijvoorbeeld 1 jaar.
3. **Repository access**: *Only select repositories* → alleen `vaste-lasten-data`.
4. **Permissions → Repository permissions → Contents**: *Read and write*.
5. **Generate token**, en kopieer hem meteen. Bewaar hem in je wachtwoordmanager.

Geef je partner de tweede token op een veilige manier, bijvoorbeeld via een gedeelde kluis in je wachtwoordmanager, of laat hem direct op haar telefoon intypen.

## 4. Koppelen: eerste persoon

1. Open de app → **Instellingen → Synchroniseren via GitHub**.
2. Vul je GitHub-gebruikersnaam, `vaste-lasten-data` en je token in → **Verder**.
3. Vul jouw naam, de naam van je partner, een **gezamenlijk wachtwoord** (2×) en een **eigen wachtwoord** (2×) in → **Koppelen**.
4. Zet daarna bij *Lasten* de gedeelde lasten om naar **Gezamenlijk** (tik op de last → Soort → Gezamenlijk → Opslaan).

## 5. Koppelen: partner

1. Partner installeert de app vanaf dezelfde link.
2. **Instellingen → Synchroniseren via GitHub**: vul **jouw** GitHub-gebruikersnaam in (de eigenaar), `vaste-lasten-data` en de partner-token → **Verder**.
3. Vul het gezamenlijke wachtwoord in → **Verder**.
4. Kies de eigen naam, kies een eigen wachtwoord (2×) → **Koppelen**.

Een tweede apparaat van dezelfde persoon koppel je op dezelfde manier: kies dezelfde naam en gebruik hetzelfde eigen wachtwoord.

## Verdeling en inleg

- Onder **Instellingen → Huishouden** stel je de namen en de standaardverdeling in (bijvoorbeeld 60/40). Dat geldt voor jullie allebei.
- Per gezamenlijke last kun je afwijken via *Jouw deel (%)*. Leeg laten = standaard.
- **Gezamenlijke rekening** toont wat ieder maandelijks moet overmaken. Kwartaal- en jaarbedragen zijn over het jaar gespreid.
- Met de knoppen *Alles · Gezamenlijk · Eigen* filter je alle schermen.

## Veiligheid

- Alles wordt op het apparaat versleuteld (AES-256-GCM, sleutel via PBKDF2) voordat het naar GitHub gaat.
- Wachtwoorden worden nergens opgeslagen. Elk apparaat bewaart alleen een afgeleide sleutel die niet uit de app te halen is.
- Vergeet je een wachtwoord, dan is dat bestand in GitHub onbruikbaar. De gegevens op je apparaten blijven wel staan.
- Iemand met een token kan de bestanden technisch overschrijven of verwijderen, maar niet lezen zonder het bijbehorende wachtwoord. GitHub bewaart elke oude versie in de geschiedenis.
- Apparaat kwijt? Trek de token van die persoon in op GitHub en maak een nieuwe aan.
- Een back-up van *Download als bestand* is **niet** versleuteld. Zet die nooit in een repository.

## Problemen

| Melding | Oplossing |
|---|---|
| Repository niet gevonden | Controleer de gebruikersnaam van de eigenaar, de repo-naam en of de token toegang heeft tot precies deze repo. |
| De token is ongeldig of verlopen | Maak een nieuwe token aan, tik *Ontkoppelen* en koppel opnieuw. |
| De token mag niet schrijven | Zet *Contents* op *Read and write* bij de token. |
| Gezamenlijk wachtwoord klopt niet | Gebruik het wachtwoord dat de eerste persoon heeft gekozen. |
| Eigen wachtwoord klopt niet | Je hebt op een ander apparaat al een eigen wachtwoord gekozen; gebruik dat. Of je koos de verkeerde naam. |
| Deze repository is openbaar | Zet de data-repository op *Private* via Settings → General → Danger Zone. |

## App bijwerken

Elke versie heeft een eigen versienummer. Je ziet het klein naast de naam, linksboven; tik erop voor de lijst met wijzigingen. Alles staat ook in `CHANGELOG.md`.

1. Upload bij een nieuwe versie altijd deze drie bestanden naar de publieke repo: `index.html`, `sw.js` en `version.json`.
2. Op je apparaten verandert het label linksboven binnen een paar minuten in **Update beschikbaar** (op de iPhone: **Update**). Tik erop en de app werkt zichzelf bij.
3. Werk ook de apparaten van je partner bij, zeker bij een versie met *Let op* in de changelog.

De app controleert op updates bij openen, als je hem weer naar voren haalt en als je weer online komt.
