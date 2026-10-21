# Vaste Lasten

Een installeerbare web-app om maandelijks terugkerende uitgaven bij te houden, met optionele, versleutelde synchronisatie via een privé GitHub-repository.

## Bestanden

| Bestand | Doel |
|---|---|
| `index.html` | De app zelf |
| `manifest.webmanifest` | Naam, kleuren en iconen voor installatie |
| `sw.js` | Service worker: laat de app offline werken |
| `icon-*.png`, `apple-touch-icon.png` | App-iconen |

## 1. App publiceren (publieke repository)

1. Maak op GitHub een repository `vaste-lasten`, **Public**.
2. Upload alle bestanden uit deze map naar de hoofdmap van de repo.
3. Ga naar **Settings → Pages**, kies *Deploy from a branch*, branch `main`, map `/ (root)`, **Save**.
4. De app staat na een minuut op `https://<gebruikersnaam>.github.io/vaste-lasten/`.

Deze repository bevat alleen code, nooit je gegevens.

## 2. Opslag voor synchronisatie (privé repository)

1. Maak een tweede repository `vaste-lasten-data`, **Private**. Vink *Add a README file* aan, zodat de repo niet leeg is.
2. Laat hem verder leeg. De app maakt zelf het bestand `vaste-lasten.json` aan.

## 3. Token aanmaken

1. Ga naar **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Naam: `Vaste Lasten`. Vervaldatum: bijvoorbeeld 1 jaar.
3. **Repository access**: *Only select repositories* → kies alleen `vaste-lasten-data`.
4. **Permissions → Repository permissions → Contents**: *Read and write*. (Metadata: Read-only wordt automatisch toegevoegd.)
5. Klik **Generate token** en kopieer hem meteen; GitHub toont hem maar één keer.

Bewaar de token in je wachtwoordmanager, zodat je hem op een volgend apparaat opnieuw kunt plakken.

## 4. Koppelen in de app

1. Open de app op je eerste apparaat en ga naar **Overzicht → Synchroniseren via GitHub**.
2. Vul je gebruikersnaam, `vaste-lasten-data`, de token en een wachtwoord voor versleuteling in.
3. Tik **Koppelen**. Je huidige lasten gaan versleuteld naar GitHub. Voorbeeldlasten gaan niet mee.
4. Herhaal op elk volgend apparaat met **dezelfde token en hetzelfde wachtwoord**. De app haalt je lasten op en voegt ze samen.

Daarna synchroniseert de app vanzelf: bij openen, bij elke wijziging en zodra je weer online bent. Het label rechtsboven toont de status.

## Veiligheid

- Je gegevens worden op het apparaat versleuteld (AES-256-GCM, sleutel afgeleid met PBKDF2) voordat ze naar GitHub gaan. In de repo staat alleen onleesbare tekst.
- Het wachtwoord wordt nergens opgeslagen. Vergeet je het, dan is de kopie in GitHub onbruikbaar; de gegevens op je apparaten blijven wel staan.
- De token staat op elk gekoppeld apparaat. Hij heeft alleen toegang tot `vaste-lasten-data`. Verlies je een apparaat, trek de token dan in via GitHub en maak een nieuwe aan.
- Zet nooit een back-upbestand (`vaste-lasten-*.json` van *Download als bestand*) in een repository; die zijn niet versleuteld.

## Problemen

| Melding | Oplossing |
|---|---|
| Repository niet gevonden | Controleer de spelling en of de token toegang heeft tot precies deze repo. |
| De token is ongeldig of verlopen | Maak een nieuwe token aan, tik *Ontkoppelen* en koppel opnieuw. |
| De token mag niet schrijven | Zet *Contents* op *Read and write* bij de token. |
| Het wachtwoord klopt niet | Gebruik hetzelfde wachtwoord als op je eerste apparaat. |
| Deze repository is openbaar | Zet de data-repository op *Private* via Settings → General → Danger Zone. |

## App bijwerken

Upload een nieuwe `index.html` naar de publieke repo; de app haalt hem vanzelf op. Verander je iconen of het manifest, verhoog dan `CACHE` in `sw.js` (bijvoorbeeld naar `vaste-lasten-v3`).
