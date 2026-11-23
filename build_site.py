"""Build Feestrun.

Joins the parts in src/ into one script and writes:
  artifact.html                                  raw join, all five games with a game switcher
                                                 (single page; the tests run this file)
  dist/feestspellen/feestrun/index.html     hub page linking the five games
  dist/feestspellen/feestrun/<game>.html    one page per game (FIXED_GAME set)
  dist/feestspellen/feestrun/<game>-embed.html  compact iframe version of that game
  dist/feestspellen/feestrun/img/           logo, favicon, category images
  dist/feestspellen/LEESMIJ.txt + dist/feestspellen.zip   upload package
  docs/                                          copy of the site for GitHub Pages (main branch, /docs)
"""
import os, re, shutil, zipfile

VERSION = '2.3'
# Anonymous statistics (GoatCounter, hosted or self-hosted): the count address, e.g. 'https://CODE.goatcounter.com/count'.
# Empty = the built pages send nothing. artifact.html (tests, development) never sends anything.
STATS = 'https://feestspellen.goatcounter.com/count'
assert STATS == '' or re.fullmatch(r"https://[a-z0-9.-]+/count", STATS), STATS
STATS_MARK = "/*STATS-URL*/''"
DATE = '22 november 2026'
PARTS = ['head.part', 'js1.part', 'segs.part', 'levels.part', 'js2_platform.part', 'js3_flappy.part',
         'js4_snake.part', 'js5_tetris.part', 'js7_memory.part', 'js8_catch.part', 'js9_route.part', 'js10_pop.part', 'js11_sort.part', 'js6_flow.part']
# The games: one row per game page. Names, styles, blurbs and level names come from src/levels.part (the JS GAMES),
# read below and checked against this table, so they live in one place. Adding a game: add it in both places.
GAMES = [  # id, page title part, meta description
    ('platformer', 'De winkel (platformer)', 'Spring als clowntje door de winkel van J-Martens.nl en verzamel alle productcategorieën in 3 levels.'),
    ('flappy', 'Ballonvlucht (flappy)', 'Zweef als clownsballon tussen de rollen cadeaupapier door en vang alle productcategorieën van J-Martens.nl in 3 levels.'),
    ('snake', 'De ballonnenslang (snake)', 'Loop als clowntje voorop in een polonaise van ballonnen, eet alle productcategorieën van J-Martens.nl en ontwijk de spelden. 3 levels.'),
    ('tetris', 'Dozen inpakken (tetris)', 'Stapel de dozen van J-Martens.nl strak in: elke volle rij is een verzonden bestelling. 3 levels.'),
    ('memory', 'Kaartjes zoeken (memory)', 'Zoek de paren van alle productcategorieën van J-Martens.nl en pas op voor de spelden. 3 levels.'),
    ('winkelmandje', 'Winkelmandje (vangen)', 'Vang als clowntje alle productcategorieën van J-Martens.nl in je winkelmandje en ontwijk de vallende spelden. 3 levels.'),
    ('bezorgroute', 'Bezorgroute (puzzel)', 'Draai de wegstukken zodat de bestelbus van J-Martens.nl alle klanten bereikt en verzamel zo alle productcategorieën. 3 levels.'),
    ('prikken', 'Ballonnen prikken', 'Prik de ballonnen met de productcategorieën van J-Martens.nl, maar niet de rode J-ballonnen van de winkel. 3 levels.'),
    ('vakkenvullen', 'Vakken vullen (sorteren)', 'Sorteer de producten in het vak van de goede categorie en leer zo alle productcategorieën van J-Martens.nl kennen. 3 levels.'),
]
FAVICON = 'img/favicon.png'
NUMBER = {1: 'één', 2: 'twee', 3: 'drie', 4: 'vier', 5: 'vijf', 6: 'zes', 7: 'zeven', 8: 'acht', 9: 'negen', 10: 'tien'}

# read the JS game list: id, name, style, blurb and the level names, in order
levels_js = open('src/levels.part', encoding='utf-8').read()
JS_GAMES = []
for m in re.finditer(r"\{id:'(\w+)',name:'([^']+)',style:'([^']+)'.*?blurb:'([^']+)'.*?levels:\[(.*?)\]\}", levels_js, flags=re.S):
    JS_GAMES.append(dict(id=m[1], name=m[2], style=m[3], blurb=m[4], levels=re.findall(r"name:'([^']+)',sub:'", m[5])))
assert [g['id'] for g in JS_GAMES] == [g[0] for g in GAMES], f'GAMES in build_site.py and src/levels.part differ: {[g["id"] for g in JS_GAMES]}'
for g in JS_GAMES:
    assert len(g['levels']) == 3, (g['id'], g['levels'])
    assert os.path.exists(f"src/hub/{g['id']}.svg"), f"missing hub picture src/hub/{g['id']}.svg"
N_WORD = NUMBER[len(GAMES)]
STYLES = [g['style'].lower() for g in JS_GAMES]
STYLE_LIST = ', '.join(STYLES[:-1]) + ' en ' + STYLES[-1]

src = ''.join(open('src/' + p, encoding='utf-8').read() for p in PARTS)
open('artifact.html', 'w', encoding='utf-8', newline='').write(src)  # alles op één pagina (zonder doctype/head)

# strip the test handle
src = re.sub(r"window\.__feest=\{.*?\};\n", "", src)
assert '__feest' not in src
assert src.count("const FIXED_GAME=null;") == 1
assert src.count(STATS_MARK) == 1
src = src.replace(STATS_MARK, repr(STATS))


def wrap(body, title, description, extra_css=''):
    body = body.replace('<title>Feestrun J. Martens</title>\n', '', 1)
    return ('<!DOCTYPE html>\n<html lang="nl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
            f'<title>{title}</title>\n<meta name="description" content="{description}">\n'
            f'<link rel="icon" type="image/png" href="{FAVICON}">\n<meta name="robots" content="index,follow">\n'
            '<style>html{color-scheme:light}body{margin:0;background:#fff}img{max-width:100%}[hidden]{display:none!important}' + extra_css + '</style>\n'
            '</head>\n<body>\n' + body + '\n</body>\n</html>\n')


EMBED_STRIP = [r'  <div class="top">.*?</div>\n  </div>\n', r'  <div class="brandbar">.*?</div>\n  </div>\n',
               r'  <div class="xline">De levels</div>\n  <div class="levels" id="levelCards"></div>\n',
               r'  <div class="usp">.*?</div>\n', r'  <footer>.*?</footer>\n']


def embed_of(page):
    emb = page
    for pat in EMBED_STRIP:
        emb, n = re.subn(pat, '', emb, flags=re.S); assert n == 1, pat
    emb = emb.replace('<img class="nav-logo" src="img/logo.png" alt="" hidden>', '<img class="nav-logo" src="img/logo.png" alt="J-Martens.nl">')
    emb = emb.replace('<button type="button" class="home" data-home>Home</button>',
                      '<button type="button" class="home" data-home>Home</button><button type="button" id="btnMute" aria-pressed="false" style="margin-left:auto">🔊 Geluid</button><button type="button" id="btnRestart">↻ Opnieuw</button>')
    return emb


out = 'dist/feestspellen/feestrun'
shutil.rmtree('dist/feestspellen', ignore_errors=True); os.makedirs(out + '/img')
pages = set()
for gid, gtitle, gdesc in GAMES:
    page = src.replace("const FIXED_GAME=null;", f"const FIXED_GAME='{gid}';")
    assert page.count(f"const FIXED_GAME='{gid}';") == 1
    open(f'{out}/{gid}.html', 'w', encoding='utf-8', newline='').write(wrap(page, f'Feestrun – {gtitle} – J-Martens.nl', gdesc))
    open(f'{out}/{gid}-embed.html', 'w', encoding='utf-8', newline='').write(wrap(embed_of(page), f'Feestrun – {gtitle} – J-Martens.nl', gdesc,
                                                     '.wrap{padding:8px 8px 10px!important}.nav{margin-bottom:8px!important}'))
    pages.add(f'{gid}.html')

# hub: the stylesheet of head.part + the static hub fragment
head = open('src/head.part', encoding='utf-8').read()
styles = re.findall(r'<style>.*?</style>', head, flags=re.S); assert len(styles) == 1
hub = open('src/hub.part', encoding='utf-8').read()
# the hub's seasonal script uses the same date rule as the games: copy it from js1.part
js1 = open('src/js1.part', encoding='utf-8').read()
rules = re.findall(r'/\*THEME-RULES\*/\n(.*?)/\*END-THEME-RULES\*/', js1, flags=re.S); assert len(rules) == 1
assert hub.count('/*THEME-RULES*/') == 1
hub = hub.replace('/*THEME-RULES*/', rules[0].strip())
assert hub.count(STATS_MARK) == 1
hub = hub.replace(STATS_MARK, repr(STATS))
nav = ''.join(f'    <a href="{g["id"]}.html">{g["name"]}</a>\n' for g in JS_GAMES)
cards = ''.join(f'    <a class="lv" href="{g["id"]}.html">{open(f"src/hub/{g["id"]}.svg", encoding="utf-8").read().strip()}'
                f'<span class="badge">{g["style"]}</span><div class="t">{g["name"]}</div><div class="s">{g["blurb"]}</div>'
                '<div class="s"><b>3 levels:</b> makkelijk · gemiddeld · moeilijk</div></a>\n' for g in JS_GAMES)
for mark, html in (('<!--GAME-NAV-->\n', nav), ('<!--GAME-CARDS-->\n', cards)):
    assert hub.count(mark) == 1, mark
    hub = hub.replace(mark, html)
assert 'q5 5 10 0' not in hub, 'hub still draws the old balloon hero (smile path); use the clown from the <defs> at the top'
assert hub.count('href="#fr-clown') >= 4, 'hub cards should show the clown'
for href in re.findall(r'href="([^"]+\.html)"', hub):
    assert href == 'index.html' or href in pages, f'hub links to unknown page {href}'
open(f'{out}/index.html', 'w', encoding='utf-8', newline='').write(wrap(styles[0] + '\n' + hub, 'Feestrun – de spelletjes van J-Martens.nl',
                                          f'Feestrun: {N_WORD} spelletjes van J-Martens.nl. Verzamel als clowntje alle productcategorieën in een {STYLE_LIST}, elk met 3 levels.',
                                          '.wrap p{font-size:15px;line-height:1.5}'))

for f in os.listdir('src/img'):
    if not f.startswith('logo-origineel'): shutil.copy('src/img/' + f, out + '/img/' + f)

FILE_LINES = ''.join(f'  {g["id"] + ".html":<22}"{g["name"]}" ({g["style"].lower()}), 3 levels\n' for g in JS_GAMES)
LEVEL_LINES = ''.join(f'      {g["name"] + ":":<20}{" · ".join(g["levels"])}\n' for g in JS_GAMES)
OTHER_IDS = ', '.join(g['id'] for g in JS_GAMES[1:-1]) + ' of ' + JS_GAMES[-1]['id']
open('dist/feestspellen/LEESMIJ.txt', 'w', encoding='utf-8', newline='').write(f'''FEESTRUN – spelletjes voor J-Martens.nl  (versie {VERSION}, {DATE})
=====================================================================

NIEUW IN 2.3
  - De speler is nu een clowntje (met het logo-oogje en een glimlach) in plaats
    van de rode ballon; ook de plaatjes op de startpagina zijn aangepast.
  - Level 2 van De winkel en van Ballonvlucht is wat moeilijker gemaakt.
  - Speel als clowntje of als clownmeisje (kies op het titelscherm).
  - Nieuwe spellen: Winkelmandje (vang de kaartjes die van de schappen vallen) en
    Bezorgroute (draai de wegstukken zodat de bestelbus alle klanten bereikt) en
    Ballonnen prikken (prik de ballonnen met een kaartje eraan) en Vakken vullen
    (sorteer de producten in het goede vak).
  - Sterren en je eigen record per level.
  - Feestdagen: Sinterklaas, Kerst, Carnaval en Pasen, elk met eigen versiering en
    muziek. Dat gaat vanzelf; zie "Goed om te weten" hieronder.
  Gewoon alle bestanden in de map "feestrun" vervangen door deze nieuwe versie.

INHOUD VAN DE MAP "feestrun"
  index.html            Startpagina met kop, logo, rode balk en de {N_WORD} spelletjes.
                        Te gebruiken als eigen pagina, bijv. https://j-martens.nl/feestrun/
{FILE_LINES}  <spel>-embed.html     Compacte versie van elk spel (alleen spel + levelbalk) om in een
                        WordPress-pagina te zetten via een iframe.
  Komen er later spelletjes bij, dan zijn dat gewoon extra bestanden in deze map en
  een extra kaartje op de startpagina; de bestaande bestanden blijven werken.
  img/                  Het logo (logo.png, favicon.png) en de 10 categoriebeelden (320x320 jpg).
                        Vervang een beeld door een nieuw bestand met dezelfde naam als een
                        categoriefoto verandert.

Alles staat in de map zelf. Er is geen database, plugin of externe code nodig,
behalve de lettertypen Grandstander en Roboto van Google Fonts (die de website
al gebruikt).

STAP 1 – MAP OP DE WEBSERVER ZETTEN
  1. Log in op de hosting (FTP of de bestandsbeheerder van het hostingpaneel).
  2. Upload de hele map "feestrun" naar de hoofdmap van de website, naast de map
     wp-content. Het resultaat is dan: https://j-martens.nl/feestrun/
     (Een andere plek mag ook, bijv. wp-content/uploads/feestrun/. Pas dan de
     adressen in stap 2 aan.)
  3. Open https://j-martens.nl/feestrun/ in de browser, klik een spel aan en
     controleer dat de categoriebeelden op het titelscherm zichtbaar zijn.

STAP 2 – IN DE WEBSITE ZETTEN
  Het makkelijkst: zet een knop of menu-item (Weergave > Menu's) met een link naar
  https://j-martens.nl/feestrun/ . Die startpagina heeft zelf al de kop en de rode
  balk in de huisstijl en linkt naar de {N_WORD} spelletjes.

  Liever een spel in een eigen WordPress-pagina? Maak een pagina, voeg een blok
  "Aangepaste HTML" toe en plak dit erin. Voor een ander spel vervang je
  platformer door {OTHER_IDS}:

     <iframe src="https://j-martens.nl/feestrun/platformer-embed.html"
             title="Feestrun – De winkel – J-Martens"
             style="width:100%;max-width:1000px;aspect-ratio:1000/680;min-height:520px;border:0;display:block;margin:0 auto"
             loading="lazy" allow="autoplay"></iframe>

GOED OM TE WETEN
  - Geluid en muziek starten pas na de eerste klik of toetsaanslag; dat is een
    regel van browsers, geen fout.
  - Werkt op computer (pijltjes, spatie, R, M; bij memory en de vier nieuwe spellen kan ook de muis) en op telefoon/tablet (knoppen
    onder het speelveld). Op een telefoon is het speelveld het grootst als je
    hem een kwartslag draait; het spel zegt dat zelf ook.
  - Een level direct openen kan met ?level=2 achter de bestandsnaam, bijv.
    https://j-martens.nl/feestrun/flappy.html?level=2
  - Elk spel heeft drie levels: makkelijk, gemiddeld en moeilijk. Elk level eindigt
    met een kassabon; na level 3 staat ook de totaalscore van het spel op de bon.
{LEVEL_LINES}  - Feestdagen gaan vanzelf, op de datum van het apparaat van de speler; er hoeft
    niets voor geüpload of aangezet te worden. Elk thema heeft eigen versiering,
    een eigen muziekje en een regel op de startpagina:
      Sinterklaas  10 november t/m 5 december: het clowntje is een pietje,
                   mijters, pakjes, chocoladeletters, pepernoten, en de
                   startpagina telt af naar pakjesavond.
      Kerst        6 december t/m 6 januari: kerstmuts, kerstballen, sneeuw,
                   Jingle Bells.
      Carnaval     de twee weken voor Aswoensdag (dat schuift elk jaar mee met
                   Pasen): narrenkap, vlaggetjes in rood-geel-groen, confetti en
                   hoempamuziek.
      Pasen        de twee weken voor Pasen t/m tweede paasdag: paashaasoren,
                   paaseieren, bloesem en een lentedeuntje met vogeltjes.
    Daarna is alles weer gewoon. Bekijken of uitzetten kan met ?thema=sint,
    ?thema=kerst, ?thema=carnaval, ?thema=pasen of ?thema=geen achter de
    bestandsnaam, bijv.
    https://j-martens.nl/feestrun/?thema=carnaval (blijft aan als je doorklikt).
  - Op het titelscherm kiest de speler het clowntje of het clownmeisje. De keuze,
    de records en de sterren per level worden alleen in de eigen browser bewaard.
  - Statistieken: de spellen tellen anoniem hoe vaak een pagina wordt geopend en
    hoe een level afloopt (gestart, gehaald, game over). Geen cookies en geen
    gegevens over de speler; er is geen cookiemelding voor nodig. De telling loopt
    via GoatCounter (goatcounter.com). Zet daarover een regel in de
    privacyverklaring van de website.
  - Teksten aanpassen: open het spelbestand in een teksteditor; de categorienamen
    staan bovenin het script bij "const CATS", de spel- en levelnamen en de uitleg
    bij "const GAMES".
  - Wil je het spel later bijwerken, dan vervang je gewoon de bestanden in de map.
''')
# GitHub Pages: the same site, served from docs/ on the main branch
shutil.rmtree('docs', ignore_errors=True); shutil.copytree(out, 'docs'); open('docs/.nojekyll', 'w').close()

z = 'dist/feestspellen.zip'
with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, _, files in os.walk('dist/feestspellen'):
        for f in sorted(files):
            p = os.path.join(root, f); zf.write(p, os.path.relpath(p, 'dist'))
print('built', os.path.getsize(z))
