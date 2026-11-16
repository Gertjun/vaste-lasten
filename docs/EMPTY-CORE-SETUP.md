# Lege PWA-Core-kluizen aanmaken

## Status

Geïmplementeerd in PR #10, versie 3.2.0 in voorbereiding. De PR blijft draft totdat de volledige CI en review van de implementatie zijn afgerond.

## Doel

Vaste Lasten opnieuw starten met drie onafhankelijke, lege PWA-Core-domeinen:

- gedeeld: `pwa-core-v1/samen.json`
- persoonlijk p1: `pwa-core-v1/eigen-p1.json`
- persoonlijk p2: `pwa-core-v1/eigen-p2.json`

De gebruiker voert alle categorieën en lasten daarna handmatig in.

## Werking

1. Op het eerste apparaat kiest de gebruiker het nieuwe gezamenlijke wachtwoord en het nieuwe persoonlijke wachtwoord. De app maakt de gedeelde kluis en de persoonlijke kluis van het actieve profiel aan.
2. Op het tweede apparaat gebruikt de gebruiker hetzelfde gezamenlijke wachtwoord en het eigen nieuwe persoonlijke wachtwoord. De app importeert uitsluitend de bestaande lege gedeelde kluis en maakt de persoonlijke kluis van het tweede profiel aan.
3. Per domein wordt de remote GitHub-inhoud na synchronisatie opnieuw opgehaald en ontsleuteld gecontroleerd. De app meldt succes alleen na deze bevestiging.
4. De setup is hervatbaar: een eerder aangemaakte lege lokale/remote kluis wordt gecontroleerd en opnieuw gebruikt. Bij gedeeltelijk succes worden reeds bevestigde kluizen niet gereset.
5. Een lokale marker voorkomt dat oude lokale legacygegevens bij een volgende ontgrendeling alsnog automatisch in de nieuwe Core-kluizen worden samengevoegd.

## Fail-closed veiligheidsregels

- De legacy-migratiefunctie wordt niet gebruikt.
- De oude lokale data (`vastelasten.v2`) en eventuele staging blijven behouden maar worden na de schone start niet automatisch geïmporteerd.
- Oude remote legacybestanden (`samen.json`, `eigen-p1.json`, `eigen-p2.json`) worden niet gelezen, gewijzigd of verwijderd.
- Een bestaande Core-kluis met inhoud of onbekende velden wordt geweigerd.
- Een bestaand lokaal en remote Core-bestand met een sleutelconflict wordt geweigerd; er is geen automatische reset of overschrijving.
- Alleen de gedeelde kluis en de persoonlijke kluis van het actieve profiel worden geopend.
- Een synchronisatie- of bevestigingsfout laat de reeds aangemaakte lokale kluis staan zodat veilig opnieuw geprobeerd kan worden.
- Opruiming van oude gegevens is een afzonderlijke latere stap, nadat beide apparaten en alle drie de nieuwe kluizen zijn gecontroleerd.

## Geautomatiseerde tests

De nieuwe testset gebruikt uitsluitend synthetische opslag, mockclients en Web Crypto met testwachtwoorden. Ze controleert:
- eerste apparaat maakt een lege gedeelde kluis aan;
- tweede apparaat sluit aan op de bestaande lege gedeelde kluis;
- tweede profiel maakt uitsluitend de eigen persoonlijke kluis aan;
- niet-lege lokale of remote Core-inhoud wordt geweigerd;
- verkeerd wachtwoord laat remote data onaangeroerd;
- uploadfout verwijdert of reset de lokale lege kluis niet;
- runtime-coördinatie op twee gescheiden apparaten, inclusief profielscheiding en hervatten na gedeeltelijk succes;
- een niet-lege remote wijziging die na de eerste preflight verschijnt, wordt ook door de synchronisatie geweigerd;
- wachtwoorden korter dan 12 tekens worden geweigerd voordat opslag wordt aangeraakt.

## Nog te verifiëren

- Volledige GitHub Actions-CI op de nieuwste PR-head.
- Fysieke acceptatie op iPhone Safari en Windows 11 Edge, eerst op het eerste en daarna op het tweede apparaat.

Geen productiegegevens, echte privé-datarepository, productie-token of passkey gebruikt tijdens de geautomatiseerde tests.
