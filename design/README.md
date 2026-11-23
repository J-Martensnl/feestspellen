# Ontwerpschetsen

Schetsen van figuren voor Feestrun. Ze horen niet bij de build (`build_site.py` gebruikt deze map niet);
open de html-bestanden direct in de browser.

- `clown.html` – het **clowntje**, de nieuwe held, met het gezicht **Logo + glimlachje** (`logoglim`: de
  logo-oogjes zonder wenkbrauwen en een klein rood lachje). Alle andere gezichtjes staan er nog in als `style`;
  `gezichtjes.html`, `meer-gezichtjes.html` en `logo-oogjes.html` laten ze naast elkaar zien. Rechte beentjes zonder knieën, een loopcyclus
  met afrollende voeten en meezwaaiende armen, en een sprong: inzakken, afzetten, stijgen, hoogste punt,
  vallen en landen. `drawClown(ctx, {face, style, p, walking, air, vy, squash, lk, t})` tekent hem met de
  voeten op (0,0), ongeveer 52 eenheden hoog; `vy` < 0 is omhoog.
- `j-hoeken.html` – de J-mond onder verschillende hoeken (voor het gezicht met logo-ogen).
- `poppetjes-voorbeeld.html` – de eerste vier poppetjes: clowntje, **clownmeisje**, ballonpoppetje en
  neusmannetje (`makePoppetjes(ctx)`). Het clownmeisje bewaren we om later ergens in te zetten, bijvoorbeeld
  als tweede speelbaar figuur of als verkoopster bij de kassa.
