# Lege PWA-Core-kluizen aanmaken

## Status

Ontwerp- en implementatievoorstel. Dit document introduceert nog geen productiebediening en voert geen wijzigingen uit in lokale of remote kluizen.

## Doel

Vaste Lasten opnieuw starten met drie onafhankelijke, lege PWA-Core-domeinen:

- gedeeld: `pwa-core-v1/samen.json`
- persoonlijk p1: `pwa-core-v1/eigen-p1.json`
- persoonlijk p2: `pwa-core-v1/eigen-p2.json`

De gebruiker voert alle categorieën en lasten daarna handmatig in.

## Vereiste startvolgorde

1. Controleer dat de geïnstalleerde app-versie op alle apparaten de nieuwe startprocedure ondersteunt.
2. Controleer de ingestelde privérepository en de profielidentiteit (`p1` of `p2`) op het huidige apparaat.
3. Maak alleen de gedeelde kluis en de persoonlijke kluis van het actieve profiel aan, elk met een afzonderlijk wachtwoord en een eigen willekeurige datasleutel.
4. Synchroniseer en bevestig beide bestanden op GitHub voordat de procedure als geslaagd wordt gemeld.
5. Op het tweede apparaat: open de reeds aangemaakte gedeelde kluis met hetzelfde gedeelde wachtwoord; maak uitsluitend de persoonlijke kluis van het andere profiel aan.
6. Bevestig dat de tweede persoonlijke kluis is gesynchroniseerd. De drie remote bestanden moeten nu bestaan en onafhankelijk ontgrendelbaar zijn.

## Fail-closed veiligheidsregels

- Gebruik de legacy-migratiefunctie niet: die importeert oude gegevens en verhoogt de legacy-updatebarrière.
- Verwijder of wijzig geen legacybestanden (`samen.json`, `eigen-p1.json`, `eigen-p2.json`) als onderdeel van de kluisaanmaak.
- Verwijder geen lokale opslagprefixen en wis geen bestaande Core-kluizen.
- Overschrijf nooit een bestaand remote Core-bestand.
- Een bestaand lokaal of remote Core-bestand mag alleen worden geopend als het juiste profiel, pad en wachtwoord zijn bevestigd; bij een onverwachte inhoud of sleutelconflict stoppen.
- Maak nooit de persoonlijke kluis van het andere profiel aan op het apparaat van de huidige gebruiker.
- Bij gedeeltelijk succes: behoud alle aangemaakte kluizen, rapporteer exact welke domeinen bevestigd zijn en bied een veilige hervatting aan. Geen automatische reset.
- De opruiming van oude gegevens is een afzonderlijke, latere actie met eigen expliciete bevestiging en controle van de drie doelbestanden.

## Benodigde geautomatiseerde tests

- eerste apparaat maakt shared + personal-p1 aan, zonder legacydata te lezen;
- tweede apparaat hergebruikt uitsluitend de lege remote shared-kluis en maakt personal-p2 aan;
- verkeerde repository, profiel of pad wordt geweigerd;
- bestaand niet-leeg Core-bestand wordt nooit overschreven of leeggemaakt;
- onverwachte lokale kluis of remote sleutelconflict stopt veilig;
- fout tijdens upload laat de reeds bevestigde kluis intact en hervatten is idempotent;
- shared/p1/p2 blijven strikt gescheiden;
- geen enkele test verwijdert legacybestanden of lokale opslag.

## Acceptatie op echte apparaten

Na geautomatiseerde tests: iPhone Safari en Windows 11 Edge. Controleer op beide apparaten de drie paden, de juiste profielscheiding, afzonderlijke wachtwoorden, heropenen na herstart en synchronisatie. Pas na expliciete controle kan de oude data afzonderlijk worden opgeruimd.
