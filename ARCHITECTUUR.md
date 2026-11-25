# Architectuur – hoe Vaste Lasten in elkaar zit

> **Dit bestand (heden):** opbouw van de code, datamodel, rekenregels, conventies en stijl.
> **Niet hier:** wat de app doet en de stand van nu → [`README.md`](README.md); wat er nog moet → [`ROADMAP.md`](ROADMAP.md); wat er per versie veranderde → [`CHANGELOG.md`](CHANGELOG.md); waarom → [`DECISIONS.md`](DECISIONS.md); werkafspraken → [`CLAUDE.md`](CLAUDE.md).

Bijgewerkt: 25 november 2026 · kandidaat 3.9.0 met PWA-Core v1.4.0. Pas dit bestand alleen aan als de opbouw, het datamodel, de conventies of de stijl veranderen.

## 1. Wat is het

Een installeerbare web-app (PWA) zonder eigen server, in gewone HTML, CSS en JavaScript zonder framework of bouwstap. GitHub Pages publiceert de hoofdmap van deze repository. De gegevens staan versleuteld op het apparaat en, als je dat kiest, versleuteld in een privé-GitHub-repository. Twee gebruikers (Geert en Wies) delen gezamenlijke lasten en houden elk hun eigen lasten privé.

Sinds 3.0.0 regelt de gedeelde kern **PWA-Core** (`js/core/`) kluis, versleuteling, synchronisatie, vergrendeling, passkeys en apparaatkoppeling. De app-eigen code zit in `index.html` en de adapters in `js/`.

## 2. Bestanden

| Bestand of map | Rol |
|---|---|
| `index.html` | De app: vaste head, CSS in `<style>`, de markup en het app-script als één IIFE in één inline `<script>` (de CI controleert dat het er precies één is). Bevat `APP_VERSION`, `DATA_NEEDS`, `/*WISHLIST*/` en `/*CHANGELOG*/` (de lijsten die in de app onder Over de app staan). |
| `js/core/` | PWA-Core, vastgepind op een release. **Niet hier aanpassen**: een fix hoort in `Gertjun/PWA-Core`. Welke bestanden erbij horen staat in `core-manifest.json`; de pin (release, commit, SHA-256) in `pwa-core.lock.json`. Controle: `node tools/pin.mjs verify`. |
| `js/vastelasten-core.js` | Brug tussen de Store-state van de app en de Core-kluizen, synchronisatie en vergrendeling. |
| `js/multi-vault-adapter.js` | De drie kluisdomeinen (gezamenlijk, persoonlijk p1, persoonlijk p2) en hun regels. |
| `js/bundle-biometric.js` | App-eigen passkey-sleutelbundel die de twee actieve datasleutels omhult (één Face ID-actie voor beide kluizen). |
| `js/device-pairing.js` | Adapter voor twee afzonderlijke Core PAIR-3-codes: domein, workspace en GitHub-configuratie controleren; gedeelde Core QR-weergave. PAIR-2-adapter blijft voor compatibiliteitstests. |
| `js/backup-restore.js` | Back-up terugzetten als nieuwe snapshot, pas zichtbaar na bevestigde opslag. |
| `js/conflict-review.js`, `js/cr06-fixture.js` | Conflictadministratie en synthetische testconflicten (CR-scenario's). |
| `js/vendor/` | QR-code maken en lezen (met licenties). |
| `css/base.css` | Gedeelde basis-CSS uit PWA-Core. |
| `sw.js` | Service worker. `CACHE='vaste-lasten-<versie>-core-v<core>'`. Navigatie network-first, de rest cache-first; `api.github.com` en `version.json` nooit uit de cache. `PRECACHE` moet alle Core-bestanden bevatten (controle: `node tools/precache.mjs`). |
| `version.json` | `{"version":"x.y.z"}`; de app toont "Update beschikbaar" als die afwijkt. |
| `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png` | Installatie op het beginscherm. |
| `prf-test.html` | Losse hersteltest voor passkeys met PRF. |
| `tests/` | Node-tests (`*.test.mjs`) voor Core-aansluiting, synchronisatie en beveiliging, en `tests/ui/` met de Playwright-tests van de schermen. Zie [`tests/README.md`](tests/README.md). |
| `tools/` | `pin.mjs` en `precache.mjs` (Core-controles), `release.py` (nieuwe versie klaarzetten) en `wish.py` (roadmappunt weghalen). |
| `docs/` | Achtergrond bij de overstap naar PWA-Core, het aanmaken van lege kluizen en de synchronisatietests (momentopnamen). |
| `.github/workflows/tests.yml` | Draait bij elke push en pull request alle controles en tests. |
| `_config.yml` | GitHub Pages-instellingen. |

## 3. Code-indeling van `index.html`

Het script is één IIFE; zoek op functienaam in plaats van het hele bestand te lezen. Belangrijkste onderdelen:

- **Opslag en samenvoegen:** `MERGE`, `merge()`, `prune()` (`PRUNE_DAYS` = 180), `withoutExamples()`, `migrateAll()` en `migStore()` (oude back-ups), `fromOtherTab()` (meerdere tabbladen).
- **Core:** `renderCoreGate()` (kluis kiezen, ontgrendelen, passkey), `coreWorkspaceChooserHtml()`, `coreEmptySetupHtml()`, `CORE_DRAFT_KEY`. De administraties staan in `localStorage['vastelasten.v3.profiles']` en `vastelasten.v3.active-profile`; per administratie heeft elke kluis eigen sleutels `vaste-lasten-<id>-shared:*` en `vaste-lasten-<id>-personal-p1:*`.
- **Oude synchronisatie (van vóór Core):** het paneel met `#s-owner`, `#s-next1`, `#s-linkNew`, `#s-linkJoin`; `changePw()`, `loadHist()`, `restoreFrom()`, `asNewest()`. Bereikbaar via de knop *Oude synchronisatie-instellingen openen* op het kluisscherm. De UI-tests gebruiken deze route (zie ROADMAP W44–W46).
- **Rekenen:** `occursYM`, `amountAt`, `monthly`, `p1pct`, `effSplit`, `byContribReady`, `sharedBij`, `estOf`, `myContrib`, `payDate`, `holidays`, `payPeriod`, `untilPay`, `dueLists`.
- **Weergave:** `render()`, `renderOverview()`, `rowHtml()`, `jointChip()`, `showTab()`, `placePill()`, `toggleSide()`/`applySide()`, `applySetLayout()`, `openGroup()`, `applyTheme()`.
- **Bestanden aanbieden:** altijd via `deliver(name, blob, what)` (deelmenu op aanraakschermen, anders download), nooit met een eigen downloadlink.

## 4. Datamodel

`state = {samen: Store, eigen: Store}`. In Core-mode zit elke Store als payload in een eigen versleutelde kluis; in de oude modus in `localStorage['vastelasten.v2']`.

| Onderdeel | Waar | Inhoud | Samenvoegen |
|---|---|---|---|
| `items` | beide | De lasten (velden hieronder) | per id, nieuwste `u` wint; `del[id]` verwijdert |
| `del` | beide | `{id: ms}` grafstenen; na 180 dagen opgeruimd | hoogste tijd |
| `paid` | beide | `{'2026-10': {id: {p, u, a?, by?, sh?, amt?}}}`; `a` = werkelijk bedrag, `by`/`sh`/`amt` = betaler, deel persoon 1 en bedrag bij afvinken | per vinkje, nieuwste `u` |
| `meta` | samen | `{p1, p2, split, byIncome, contrib, est, u}`: namen, standaardverdeling, percentage van het netto inkomen naar de gezamenlijke rekening, zelf ingevuld bedrag per persoon | hele object, nieuwste `u` |
| `cats` | samen | `{id: {id, name, c, ord, del, u}}` eigen categorieën en aanpassingen | per id |
| `inc` | samen | `{p1:{a,u}, p2:{a,u}}` inkomen per persoon (sinds 2.28.0 gedeeld) | per persoon |
| `settle` | samen | `{id: {id, from, to, a, u, del}}` verrekeningen | per id |
| `prof` | eigen | `{income, contrib, payday, u}` privé-profiel en loondag | nieuwste `u` |
| `scen` | eigen | `{id: {id, name, mods, add, ord, u, del}}` Wat als | per id |
| `minApp` | beide | Oudste appversie die deze gegevens veilig kan opslaan | hoogste versie |

**Item-velden:** `id, name, amount, prices` (`[{from:'', a}, {from:'2027-01', a}]`), `cat, freq` (`m q h y o`), `day, month, ym, split, payer` (`p1`/`p2`/null = gezamenlijke rekening), `end, after` (`door`/`stop`), `notice, noticeU, ref, url, note, example, u`. Voorbeelden (`example:true`, id `vbs*`/`vbe*`) worden nooit gesynchroniseerd.

**Regels:**
- Lijstitems worden nooit echt verwijderd maar krijgen een grafsteen (`del` met tijd, of `del:true` met `u`), anders komen ze via een ander apparaat terug.
- Onbekende velden blijven bewaard en gaan mee, zodat een ouder apparaat niets van een nieuwere versie wist.
- Een nieuw onderdeel krijgt een regel in `MERGE`, en zo nodig in `prune` en `asNewest`.
- **Gegevensversie:** `DATA_NEEDS` (nu 3.1.0). Verhoog die alleen als een oudere versie nieuwe gegevens verkeerd zou terugschrijven, en nooit hoger dan de nieuwe appversie (`tools/release.py` bewaakt dat). Een apparaat met een oudere versie vraagt dan eerst om bij te werken en schrijft niets.
- Oude back-ups (ook van versie 1) blijven terug te zetten via `migrateAll()`.

## 5. Opslag en synchronisatie

- **Drie kluizen** (Core): gezamenlijk (`pwa-core-v1/samen.json`), persoonlijk persoon 1 (`pwa-core-v1/eigen-p1.json`) en persoonlijk persoon 2 (`pwa-core-v1/eigen-p2.json`) in de privé-repository. Elke kluis heeft een eigen datasleutel, wachtwoord, lokale opslag en synchronisatie; een apparaat opent alleen de gezamenlijke en de eigen persoonlijke kluis.
- **Administraties:** meerdere benoemde administraties naast elkaar (D11, D12), lokaal of online.
- **Passkey:** één passkey opent de sleutelbundel met beide actieve datasleutels (D15). Na herinstalleren werkt een bestaande passkey weer na één keer ontgrendelen met wachtwoord.
- **Koppelen:** QR-code of pincode via Core PAIR-2; alleen GitHub Sync-instellingen gaan over (D14, D16).
- **Wachtwoorden:** nieuw minstens 12 tekens en minstens Redelijk (`pwLevel()`); PBKDF2 met 600.000 rondes voor nieuwe wachtwoorden (D5). Wachtwoorden worden nooit opgeslagen; het GitHub-token lokaal versleuteld (D7).
- **Synchronisatie** moet falen zonder bevestigde opslag (D6). Gelijktijdige wijzigingen worden beschermd door de GitHub-SHA: opnieuw lezen, samenvoegen en schrijven. Achtergrond en testscenario's: `docs/SYNC-CONCURRENCY-ACCEPTANCE.md`.
- **UI-voorkeuren** in `localStorage['vastelasten.ui']` (`tab, filter, me, sort, groups, mode, accent, side, setSel`), per apparaat, nooit gesynchroniseerd.
- **Externe diensten:** Google Fonts, SheetJS 0.18.5 van cdnjs (alleen bij de eerste Excel-export) en `api.github.com`. Een nieuw domein moet ook in de CSP (zie W47) en offline of bij een fout netjes worden afgevangen.

## 6. Rekenregels

- `occursYM(i,y,m)`: eenmalig alleen in `ym`, anders volgens de periode (m 1, q 3, h 6, y 12) vanaf `month`; niet meer na de einddatum als `after='stop'`.
- `amountAt` = bedrag uit de prijsgeschiedenis; `amountFor` = werkelijk bedrag als dat is ingevuld. `monthly(i)` = bedrag / periode; eenmalig telt 0.
- Verdeling `p1pct(i)` = `i.split` of `effSplit()`: naar bijdrage als `byContribReady()` (percentage gezet en van beiden een bedrag: gedeeld inkomen × percentage, anders `estOf(p)`), anders naar inkomen als `byIncome`, anders `meta.split`. De verdeling rekent alleen met gedeelde gegevens, zodat beide apparaten hetzelfde uitkomen.
- Gezamenlijke rekening telt alleen gezamenlijke lasten zonder persoonlijke betaler. Geert en Wies maken elk 75% van hun netto inkomen over; hun eigen vaste lasten zijn die bijdrage plus de eigen lasten.
- Loondag: de ingestelde dag (of de laatste van de maand), bij weekend of feestdag de werkdag ervoor. Feestdagen: Nieuwjaarsdag, Goede Vrijdag, Pasen, Koningsdag, Hemelvaart, Pinksteren, Kerst (Bevrijdingsdag niet).
- Datum voorbij: niet afgevinkt met een dag vóór vandaag (deze maand en tot 14 dagen terug). Eerstvolgende: tot 14 dagen vooruit, of tot de dag vóór je volgende loon.
- Saldo verrekenen uit vinkjes met `by` plus `settle`; positief = persoon 2 betaalt persoon 1.

## 7. Weergave en indeling

- Vijf onderdelen (`TABS`): Overzicht (wat nu moet), Maand, Lasten, Inzicht (analyse), Instellingen. Sneltoetsen 1–5, `N` nieuwe last, `/` zoeken, `[` zijbalk.
- **Omslagpunten (sinds PR #30, gelijk aan de andere apps):** telefoon tot 700 px (en liggende tablet tot 700 px hoog) met tabbalk onderin; iPad staand 700–999 px met horizontale navigatie (werkvlak max 960 px); vanaf 1000 px (`WIDE`) een zijbalk van 236 px, in te klappen tot 68 px, en een werkvlak van maximaal 1100 px.
- Instellingen: op telefoon en iPad staand vijf inklapbare groepen (`details.set-group`, `data-g` = `sync huis weer data over`) in vaste kolommen (geen CSS `columns` voor inhoud die in- en uitklapt); vanaf 1000 px een lijst met koppen (`#setNav`) en de gekozen groep ernaast.
- Het filter Alles/Gezamenlijk/Eigen is één element `#filters` dat `showTab()` verplaatst.
- Afschrijvingsregels (`.mrow`) zijn binnen een lijst even hoog (`.mlist`, `.sub.spacer`).
- Vensters: `#scrim` (last), `#amtScrim` (werkelijk bedrag), `#scenScrim` (Wat als). Geen `alert`/`confirm`/`prompt`; iets onomkeerbaars vraagt een tweede tik ("Zeker weten?").
- `IS_PWA`/`HOST_THEME`: in de Claude-voorbeeldweergave staan synchroniseren en exporteren bewust uit.

## 8. Conventies

- **Taal:** alles in het Nederlands. Teksten kort en actief ("Opslaan", daarna "Opgeslagen"); een foutmelding zegt wat er mis is en wat je kunt doen ("Vul een bedrag in, bijvoorbeeld 152,35."). Enkelvoud en meervoud kloppen.
- **Bedragen:** `Intl.NumberFormat('nl-NL', EUR)` → `€ 1.234,56`, in IBM Plex Mono met `tabular-nums`. `parseAmount()`: komma = decimaal, punten = duizendtallen; zonder komma is een punt met precies drie cijfers erachter een duizendtal.
- **Datums** voluit ("9 december 2026"; loondatum met weekdag "woensdag 25 november"). Percentages met komma ("62,5%").
- **Veiligheid:** gebruikersinvoer altijd via `esc()` in HTML; geen gegevens, wachtwoorden of tokens loggen; geen persoonlijke gegevens buiten de versleutelde kluis. Exports en back-ups zijn onversleuteld en de app zegt dat erbij.
- **Nieuw bestand:** opnemen in `PRECACHE` in `sw.js`.
- **Versie** op alle plekken tegelijk ophogen met `tools/release.py` (zie `CLAUDE.md`).
- **Roadmap:** punten hebben vaste W-nummers, ook in de app (`WISHLIST`, opgebouwd uit de sectie Wensen van `ROADMAP.md`).
- **Changelog:** nieuwste bovenaan, `## x.y.z — d maand jjjj (W-nummers)`, regels die beginnen met `Nieuw:`, `Verbeterd:`, `Opgelost:`, `Beveiliging:` of `Let op:`. Geschreven voor de gebruiker. Raakt een versie het apparaat van de partner, dan een regel "Let op: werk alle apparaten bij …".

## 9. Stijl en vormgeving

- Kleuren als CSS-variabelen op `:root`, met licht en donker (`prefers-color-scheme` en `data-theme`). Gebruik altijd de variabelen, nooit vaste kleuren.
- **Thema's:** per apparaat Automatisch/Licht/Donker en een accent (Petrol standaard, Blauw, Paars, Terracotta, Leisteen). Een accent wijzigt alleen `--accent`, `--accent-ink` en `--accent-soft`. Een nieuw accent: minstens 4,5:1 contrast op het oppervlak en tussen `--accent-ink` en `--accent`, het label Samen minstens 3:1 tegen de regel. Geen groen als accent (groen = betaald). Onderscheid mag nooit alleen van de tint afhangen (Geert gebruikt Leisteen).
- **Soortlabels:** Samen gevuld in de accentkleur, Eigen omlijnd zonder vulling.
- **Categoriekleuren** `--c1` tot `--c8` (kleurenblind-veilig palet), `--c9` grijs voor Overig; geen nieuwe kleuren verzinnen. Blokken in Lasten krijgen een lichte tint van hun categoriekleur; tekst blijft minstens 4,5:1.
- **Grafieken:** betaald groen (`--bar-paid`), open blauw (`--bar-open`), legenda bij meer dan één reeks. Statuskleuren (`--ok`, `--warn`, `--bad`) alleen voor status.
- Kaarten met radius 12 px, rustige randen, nauwelijks schaduw, geen emoji. Lettertypen: Bricolage Grotesque (koppen), IBM Plex Sans (tekst), IBM Plex Mono (bedragen).
- **Mobiel eerst:** tikvlakken minimaal 44 px, invoervelden 16 px, safe areas, geen zwevende knoppen over de inhoud. Nooit breder dan het scherm (controleer `document.documentElement.scrollWidth` tegen de schermbreedte).
- **Toegankelijkheid (WCAG 2.2 AA):** knoppen met alleen een icoon krijgen een `aria-label`, formulieren hebben zichtbare labels.
- Voor HTML en CSS gelden ook de regels in `html-best-practices.md` in het claude.ai-project.

## 10. W47 – beveiligde bestanden en CSP

De eerste inventarisatie op 20 november 2026:

- `index.html` bevat één inline app-script van circa 259 kB en één inline CSS-blok van circa 44,5 kB.
- Er zijn 39 style-attributen; een deel wordt door JavaScript in dynamische HTML opgebouwd. Daarnaast worden `style.cssText` en directe stijlproperties gebruikt.
- Externe bronnen: Google Fonts (stylesheet en fonts), GitHub API (synchronisatie) en SheetJS voor Excel-export.
- De QR-codebibliotheken en de overige vendor-code staan al lokaal in `js/vendor/`.

Daarom is alleen het script en CSS naar bestanden verplaatsen onvoldoende voor een strikte CSP. De migratie moet ook dynamische styling en externe afhankelijkheden aanpakken. Doel is scripts en styles uitsluitend vanaf de eigen origin, zonder `unsafe-inline`; noodzakelijke externe bronnen worden expliciet beperkt. SheetJS bij voorkeur lokaal, Google Fonts eventueel lokaal, en `connect-src` beperkt tot de GitHub API. De CSP wordt pas aangescherpt nadat inline stijlen zijn verwijderd en de volledige regressietest is uitgevoerd.

### Core-modus: gedeelde vormgeving (3.10.0)
De app gebruikt de gedeelde `auth-card`, `segmented`, `menu-group` en `menu-row` klassen. De app-adapter blijft verantwoordelijk voor de multi-kluisflow. Het Core-instellingenmenu opent één detailpagina tegelijk; bestaande panelen en handlers blijven behouden. De oude synchronisatiemodus behoudt haar bestaande layout.
