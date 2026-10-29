# Changelog

Alle wijzigingen aan Vaste Lasten, de nieuwste bovenaan.

Versienummers hebben de vorm `MAJOR.MINOR.PATCH`:
- **MAJOR** omhoog bij een wijziging waarbij je iets moet doen, zoals opnieuw koppelen of alle apparaten tegelijk bijwerken.
- **MINOR** omhoog bij een nieuwe functie.
- **PATCH** omhoog bij een kleine verbetering of foutoplossing.

## 2.15.1 — 29 oktober 2026
- Verbeterd: Instellingen is ingedeeld in vier groepen die je in- en uitklapt: Synchronisatie, Huishouden, Gegevens en Over de app. De app onthoudt welke je open hebt.
- Verbeterd: Synchronisatie staat bovenaan, met in de kop of je gekoppeld bent. Is er een wachtwoord nodig, dan klapt de groep vanzelf open.
- Verbeterd: exporteren en back-up staan samen onder Gegevens.

## 2.15.0 — 29 oktober 2026
- Nieuw: Datum voorbij. Lasten waarvan de datum geweest is en die je nog niet hebt afgevinkt, staan in Maand en het Overzicht apart bovenaan. Zo zie je meteen wat je nog moet controleren.
- Nieuw: aan het eind van de maand toont het Overzicht bij Eerstvolgende ook de afschrijvingen van de komende twee weken in de volgende maand. Die kun je daar meteen afvinken.
- Nieuw: in de eerste twee weken van een maand zie je ook wat er van eind vorige maand nog niet is afgevinkt.

## 2.14.4 — 29 oktober 2026
- Verbeterd: afschrijvingen in Maand en het Overzicht nemen minder ruimte in. Naam en bedrag staan bovenaan, met jouw deel onder het bedrag, en de labels over de volle breedte eronder. Op de iPhone zie je zo veel meer lasten tegelijk.
- Verbeterd: het label Nog afvinken is weg; het lege vinkje zegt hetzelfde.

## 2.14.3 — 29 oktober 2026
- Verbeterd: op de iPhone en iPad staat de knop Nieuwe last bij Lasten, naast het zoekveld. Hij zweeft niet meer over de afschrijvingen, zodat je elk vinkje kunt raken. Op de laptop staat hij zoals altijd in de zijbalk.

## 2.14.2 — 29 oktober 2026
- Verbeterd: de knoppen Alles, Gezamenlijk en Eigen staan nu bij de inhoud waar ze op werken: bij Maand naast de maandkiezer, bij Overzicht en Lasten bovenaan. Bij Instellingen verdwijnen ze, omdat ze daar niets doen.

## 2.14.1 — 27 oktober 2026
- Verbeterd: de handleiding in de download heet nu README.md in plaats van LEESMIJ.md, zodat GitHub hem op de pagina van je repository toont. Het oude bestand LEESMIJ.md kun je uit de repository verwijderen.

## 2.14.0 — 27 oktober 2026
- Nieuw: exporteren onder Instellingen → Exporteren. Het Excel-bestand bevat al je lasten, alle afschrijvingen van het gekozen jaar met gepland en werkelijk bedrag, een overzicht per maand en per categorie.
- Nieuw: een CSV met alle afschrijvingen van een jaar, met puntkomma's en komma's zodat Excel in het Nederlands hem goed opent.
- Verbeterd: bij Wat als staat de knop Weg op de telefoon naast het bedrag.

## 2.13.0 — 27 oktober 2026
- Nieuw: Wat als in het Overzicht. Reken een verandering door zonder je lasten aan te passen: een ander bedrag voor bestaande lasten, lasten die vervallen of nieuwe lasten erbij.
- Nieuw: je ziet direct het verschil in totale vaste lasten, jouw deel, de inleg per persoon en, als je je inkomen hebt ingevuld, wat je vrij te besteden hebt. Scenario's bewaar je met een naam; ze staan in je eigen bestand en zijn alleen voor jou zichtbaar.
- Opgelost: op de iPhone was de pagina bij Overzicht en Instellingen iets breder dan het scherm, waardoor Safari een beetje uitzoomde. Dat kwam door verborgen tooltips in de grafiek en de keuzerondjes bij de standaardverdeling.

## 2.12.0 — 27 oktober 2026
- Nieuw: het Overzicht vergelijkt je kosten met vorig jaar: hoeveel procent duurder of goedkoper, de grootste stijgers en dalers per last en de verschillen per categorie.
- Nieuw: de jaargrafiek toont vorig jaar als gestippelde omtrek achter elke balk, zodra er verschil is.

## 2.11.0 — 27 oktober 2026
- Nieuw: tik in Maand of Overzicht op het bedrag van een afschrijving om het werkelijk afgeschreven bedrag in te vullen, bijvoorbeeld bij een variabele rekening. De last wordt dan meteen afgevinkt en het geplande bedrag staat doorgestreept ernaast.
- Nieuw: Eenmalig bij Hoe vaak, voor een afrekening, naheffing of andere afschrijving die één keer voorkomt. Die telt mee in de maand zelf en in het jaar, maar niet als vaste last per maand. Bij Lasten staan ze onder Eenmalig.
- Nieuw: Maand en het Overzicht tonen gepland tegenover werkelijk als die verschillen. De jaargrafiek en het verrekenen rekenen met het werkelijke bedrag.
- Let op: werk alle apparaten bij, ook dat van je partner. Een versie ouder dan 2.11.0 toont een eenmalige post als maandelijkse last.

## 2.10.0 — 27 oktober 2026
- Nieuw: kies bij een gezamenlijke last wie hem betaalt: de gezamenlijke rekening, of één van jullie van een eigen rekening.
- Nieuw: het Overzicht houdt bij wat de ander moet bijdragen, bijvoorbeeld Anne betaalt jou € 572,50, met de laatste betalingen. Met Markeer als verrekend zet je het saldo op nul; dat kun je ongedaan maken.
- Nieuw: bij het afvinken legt de app vast wie betaalde, het bedrag en de verdeling op dat moment. Latere wijzigingen aan de last veranderen het saldo dus niet.
- Verbeterd: de inleg op de gezamenlijke rekening telt alleen lasten die van die rekening gaan.

## 2.9.0 — 27 oktober 2026
- Nieuw: vul onder Instellingen → Huishouden je netto inkomen in. Het staat versleuteld in je eigen bestand en is alleen voor jou zichtbaar.
- Nieuw: het Overzicht toont welk deel van je inkomen naar vaste lasten gaat en wat er per maand vrij te besteden is.
- Nieuw: gezamenlijke lasten naar inkomen verdelen. Delen jullie allebei je inkomen, dan berekent de app de standaardverdeling automatisch. Tot die tijd geldt het vaste percentage.
- Verbeterd: de namen van categorieën in Instellingen staan in gewone tekstkleur.

## 2.8.0 — 27 oktober 2026
- Nieuw: eigen categorieën. Onder Instellingen → Huishouden voeg je categorieën toe, zoals Kinderopvang of Huisdieren, en wijzig je de naam en kleur van elke categorie. Ze worden gedeeld met je partner.
- Nieuw: een categorie verwijderen kan ook; de lasten erin gaan dan naar Overig.
- Verbeterd: nieuwe kleuren voor de categorieën, die ook voor kleurenblinden goed van elkaar te onderscheiden zijn.
- Let op: werk alle apparaten bij, ook dat van je partner. Een versie ouder dan 2.6.2 toont de eigen categorieën als Overig.

## 2.7.0 — 27 oktober 2026
- Nieuw: zoeken in Lasten op naam, notitie of contract- en polisnummer. Hoofdletters en accenten maken niet uit, en de zoekterm wordt gemarkeerd.
- Nieuw: sorteren in Lasten per categorie, op bedrag, naam, dag van afschrijving of einddatum van het contract. Je keuze wordt onthouden.
- Nieuw: sneltoets / om op de laptop direct te zoeken; Esc maakt het zoekveld leeg.

## 2.6.2 — 27 oktober 2026
- Verbeterd: het blok Per categorie in het Overzicht volgt het filter, net als het kostenblok. Bij Alles en Gezamenlijk tellen gezamenlijke lasten volledig mee, bij Eigen zie je je eigen kosten. De percentages tellen op tot 100%.
- Verbeterd: de app bewaart voortaan gegevens die een nieuwere versie toevoegt, ook op een apparaat dat nog niet is bijgewerkt. Zo raak je bij volgende uitbreidingen niets kwijt.
- Verbeterd: wishlistpunten houden een vast nummer, ook in de app.

## 2.6.1 — 27 oktober 2026
- Verbeterd: de balken in de kostengrafiek van het Overzicht tonen in groen wat in die maand is betaald en in blauw wat nog open staat, met een legenda. De tooltip en de schermlezer noemen beide bedragen.
- Verbeterd: de wishlist heeft vijf nieuwe punten (10 tot en met 14).

## 2.6.0 — 26 oktober 2026
- Nieuw: prijswijzigingen met ingangsdatum. Pas je het bedrag van een bestaande last aan, dan kies je vanaf welke maand het nieuwe bedrag geldt; eerdere maanden houden het oude bedrag. Ook een aangekondigde verhoging per januari kun je alvast invoeren.
- Nieuw: de prijsgeschiedenis per last staat in het formulier, met de mogelijkheid een wijziging te verwijderen.
- Nieuw: bij Lasten zie je een komende prijswijziging en hoeveel een last ten opzichte van vorig jaar is gestegen of gedaald. De jaargrafiek en de maandlijsten rekenen per maand met het juiste bedrag.
- Let op: werk alle apparaten bij, ook dat van je partner. Een oudere versie toont alleen het huidige bedrag en kan de prijsgeschiedenis wissen als je daar een last bewerkt.

## 2.5.0 — 26 oktober 2026
- Nieuw: per last een einddatum, opzegtermijn, contract- of polisnummer en de website van de aanbieder, onder Contract en looptijd in het formulier.
- Nieuw: het Overzicht waarschuwt bij contracten die binnen twee maanden opgezegd moeten worden of aflopen, en bij een contract dat net is verlopen.
- Nieuw: kies Stopt na de einddatum voor een last die daarna vervalt, zoals een afgeloste lening. Na die maand telt hij niet meer mee en staat hij bij Lasten onder Beëindigd.
- Let op: werk alle apparaten bij, ook dat van je partner. Een oudere versie kan de contractgegevens wissen als je daar een last bewerkt.

## 2.4.1 — 26 oktober 2026
- Verbeterd: het kostenblok in het Overzicht volgt het filter. Bij Alles heet het Totale kosten, bij Gezamenlijk Gezamenlijke kosten en bij Eigen Jouw kosten. De bedragen en de jaargrafiek tellen gezamenlijke lasten dan volledig mee; daaronder staat wat jouw deel daarvan is.

## 2.4.0 — 26 oktober 2026
- Nieuw: vier onderdelen in een logischere volgorde: Overzicht, Maand, Lasten en Instellingen. De app opent op het Overzicht.
- Nieuw: het Overzicht toont de stand van deze maand, de eerstvolgende afschrijvingen om meteen af te vinken, jouw kosten met een jaargrafiek per maand, de gezamenlijke rekening en de verdeling per categorie.
- Nieuw: Instellingen bundelt huishouden (namen en verdeling), dit apparaat en synchronisatie, back-up en informatie over de app.
- Verbeterd: de maandkiezer en de maandsamenvatting staan alleen nog bij Maand, waar de maand ertoe doet. De samenvatting toont jouw deel van die maand in plaats van een jaargemiddelde.
- Verbeterd: tik op de naam van een last in Maand of Overzicht om hem te bewerken.
- Verbeterd: het filter Alles, Gezamenlijk, Eigen verdwijnt bij Instellingen, waar het niets doet.

## 2.3.0 — 26 oktober 2026
- Nieuw: het versienummer staat klein naast de naam, linksboven. Tik erop om te zien wat er veranderde.
- Nieuw: staat er een nieuwere versie klaar, dan verandert het label in Update beschikbaar. Tik erop en de app werkt zichzelf bij; je hoeft hem niet meer af te sluiten en opnieuw te openen.
- Nieuw: het bestand version.json, waarmee de app controleert of er een nieuwe versie is. Upload het voortaan mee.

## 2.2.0 — 26 oktober 2026
- Nieuw: bij Hoe vaak kun je kiezen voor Per half jaar. Je kiest de eerste maand van afschrijving; de last komt daarna elke zes maanden terug.
- Nieuw: het versienummer en deze lijst met wijzigingen staan in de app onder Overzicht.
- Let op: werk alle apparaten bij, ook dat van je partner. Een oudere versie toont halfjaarlijkse lasten maar één keer per jaar.

## 2.1.0 — 26 oktober 2026
- Nieuw: indeling per schermgrootte. iPhone: tabbladen in een balk onderin en grotere tikvlakken. iPad staand: brede samenvatting en twee kolommen. iPad liggend en laptop: vaste zijbalk met een werkvlak van twee tot drie kolommen.
- Nieuw: Deze maand is gesplitst in Nog te betalen en Betaald, elk met aantal en totaal.
- Nieuw: sneltoetsen op de laptop: N nieuwe last, pijltjes voor de maand, 1 2 3 voor de tabbladen.
- Verbeterd: invoervelden zoomen op de iPhone niet meer in.

## 2.0.0 — 21 oktober 2026
- Nieuw: elke last is Eigen of Gezamenlijk, met per last een eigen verdeling of de standaardverdeling.
- Nieuw: filter Alles, Gezamenlijk of Eigen op alle schermen.
- Nieuw: overzicht van de maandelijkse inleg per persoon op de gezamenlijke rekening.
- Nieuw: synchronisatie gesplitst in een gezamenlijk bestand en een eigen bestand per persoon, elk met een eigen wachtwoord. Je partner ziet jouw eigen lasten niet.
- Let op: opnieuw koppelen nodig. Bestaande lasten staan daarna onder Eigen.

## 1.1.0 — 15 oktober 2026
- Nieuw: synchronisatie tussen apparaten via een privé GitHub-repository, versleuteld met een wachtwoord.

## 1.0.0 — 15 oktober 2026
- Eerste versie: vaste lasten per maand, kwartaal of jaar bijhouden, per maand afvinken, overzicht per categorie, back-up en installeren als app.
