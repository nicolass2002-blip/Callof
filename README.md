# OPERATION NUKETOWN

Un FPS façon *Call of Duty* qui tourne dans le navigateur, avec **Nuketown**
(le site d'essais nucléaires de Black Ops, 1962) comme terrain de jeu :
deux pavillons en symétrie centrale, une rue à deux voies entre eux, garages,
jardins clôturés, le bus scolaire jaune, le pick-up, les mannequins, le
panneau « WELCOME TO NUKETOWN » et l'horloge de décompte du site.

Deux modes 6 contre 6 contre des bots (vous + 5 alliés face à 6 adversaires) :

- **Match à mort par équipe** — 75 éliminations ou meilleur score après 10 min.
- **Domination** — trois drapeaux (A au pavillon jaune, B au milieu de la rue,
  C au pavillon vert), 200 points, 12 min. Les éliminations ne rapportent
  rien : seuls les drapeaux tenus font monter le score, toutes les 5 secondes.

Décompte d'avant-match, séries d'éliminations, corps-à-corps, grenades
aveuglantes… et à la fin du match, la bombe part.

Aucun asset externe : géométrie, textures, sons et animations sont tous
générés par le code. La seule dépendance, three.js, est livrée dans `vendor/`,
donc le jeu fonctionne hors ligne.

## Lancer le jeu

Le jeu utilise les modules ES et un *import map* : il faut un petit serveur
HTTP (ouvrir `index.html` en `file://` ne marchera pas).

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000/
```

ou n'importe quel équivalent (`npx serve`, `php -S localhost:8000`, …).

Cliquez sur **DÉPLOIEMENT** : la souris est capturée, `Échap` la libère et met
le jeu en pause.

## Commandes

| Touche | Action |
| --- | --- |
| `ZQSD` / `WASD` / flèches | Déplacement (clavier AZERTY et QWERTY) |
| Souris | Viser |
| Clic gauche | Tirer |
| Clic droit | Visée précise (lunette pour le Dragunov) |
| `Maj` | Sprint |
| `Ctrl` / `C` | S'accroupir |
| `Espace` | Sauter |
| `R` | Recharger |
| `1` / `2` / molette | Arme principale / arme de poing |
| `G` | Grenade à fragmentation |
| `F` | Grenade aveuglante |
| `V` | Couteau (mortel au contact) |
| `4` | Déclencher la série d'éliminations |
| `B` | Mode de tir (auto / rafale) |
| `Tab` | Tableau des scores |
| `Échap` | Pause |

Réglages dans le menu : sensibilité, champ de vision, volume, qualité
(ombres et résolution de rendu), arme principale et difficulté des bots
(Recrue → Réalisme). Tout est mémorisé dans le `localStorage`.

## Armes

| Arme | Type | Dégâts | Chargeur | Particularité |
| --- | --- | --- | --- | --- |
| XM4 Carbine | Fusil d'assaut | 34 | 30 | Auto + rafale de 3 |
| MP5K | PM | 26 | 32 | Cadence 900 c/min |
| AK-74u | PM | 31 | 30 | Recul marqué |
| Olympia 12 | Fusil à pompe | 9 × 19 | 6 | Dévastateur de près |
| Dragunov | Sniper | 96 | 10 | Lunette, un coup au torse |
| M1911 | Pistolet | 29 | 8 | Arme secondaire de série |

Dégâts dégressifs avec la distance, multiplicateur à la tête, régénération de
santé après 4 s sans encaisser, grenades à fragmentation avec rebonds et
dégâts de zone occultés par les murs, et couteau (`V`) mortel à bout portant —
les bots s'en servent aussi si vous les laissez approcher.

La grenade aveuglante (`F`) éblouit qui la regarde : écran blanc et son étouffé
pour vous, perte totale de vision pour les bots pendant quelques secondes
(ils cessent de tirer et perdent leur cible).

## Séries d'éliminations

Gagnées sur des éliminations consécutives, mises en file (3 maximum) et
déclenchées avec <kbd>4</kbd> :

| Série | Récompense | Effet |
| --- | --- | --- |
| 3 | **Avion espion** | Tous les ennemis apparaissent sur la mini-carte pendant 30 s |
| 5 | **Frappe mortier** | 9 obus tombent là où vous visiez, avec le sifflement d'arrivée |
| 7 | **Hélicoptère** | Un hélico patrouille 34 s, acquiert ses cibles et les mitraille |

À 12, 15 et 20 éliminations, l'échelle recommence. Les bots n'en gagnent pas :
c'est votre avantage, à vous d'en profiter.

## Mod admin (triches)

Le jeu est entièrement hors ligne contre des bots : le mod admin est donc un
bac à sable / outil de debug, pas un contournement d'anti-triche.

Ouvrez-le depuis **MOD ADMIN** dans le menu principal, dans le menu pause, ou
avec **F1** en pleine partie (la souris est libérée, le match continue à
tourner pour régler l'aimbot en direct). Tout est mémorisé dans le
`localStorage`, et l'interrupteur « Mod actif » coupe l'ensemble d'un coup.

| Section | Options |
| --- | --- |
| **Joueur** | Mode invincible, noclip (vol libre à travers les murs), munitions infinies, élimination en un coup, aucun recul, aucune dispersion, multiplicateurs de vitesse et de détente |
| **Aimbot** | Activation, tir automatique, visée à travers les murs, verrouillage de la cible, point visé (tête/torse), cône de capture 2→180°, réactivité 1→100 (snap instantané). Compense le recul et affiche un cercle sur la cible verrouillée |
| **ESP** | Boîtes, noms, barres de vie, distance, squelette, traceurs, inclusion des alliés, radar complet sur la mini-carte, portée réglable. Trait plein = cible en vue, pointillé = derrière un mur |
| **Monde** | Geler les bots, restaurer la santé, recharger tout, téléportation au réticule, éliminer tous les ennemis, remettre le score à zéro, terminer le match |

Raccourcis : `F1` panneau · `F2` invincible · `F3` noclip · `F4` aimbot ·
`F5` ESP · `F6` geler les bots · `F7` munitions infinies · `F8` one shot ·
`T` téléportation au réticule.

Les options actives sont listées en jaune en haut à gauche du HUD, et l'écran
de fin de match signale que les statistiques ont été obtenues avec le mod.

En noclip : `ZQSD` pour voler dans l'axe du regard, `Espace` / `Ctrl` pour
monter et descendre, `Maj` pour aller plus vite.

## La carte

```
            jardin nord (clôturé)        ← cabane, portique, table
   ┌──────────────────────────────────────────────┐
   │  MAISON JAUNE ┐                              │
   │  (2 étages)   └ garage + allée               │
   │ ─────────────────── RUE ──────────────────── │  bus ← ouest   est → pick-up
   │              allée + garage ┌ MAISON VERTE   │
   │                             └ (2 étages)     │
   └──────────────────────────────────────────────┘
            jardin sud (clôturé)         ← cabane, piscine, table
```

Les deux maisons sont identiques et disposées en symétrie de rotation (180°),
comme l'originale : rez-de-chaussée séjour/cuisine, escalier, deux chambres à
l'étage dont les fenêtres surplombent la rue, garage ouvert donnant sur l'allée,
véranda côté rue, porte de service côté jardin. On peut tirer et voir à travers
toutes les fenêtres.

## Architecture

```
index.html            écran, HUD et menus (DOM)
styles/main.css        HUD, menus, tableau des scores
vendor/                three.js r160 (module, minifié) + licence
src/
  main.js              amorçage, rendu, boucle de jeu, enchaînement des écrans
  core/
    input.js           clavier/souris, pointer lock, dispositions AZERTY/QWERTY
    audio.js           synthèse WebAudio (tirs, impacts, pas, explosions, sirène)
    textures.js        textures procédurales (bitume, bardage, bardeaux, grillage…)
    util.js            maths, pools, indicatifs
  world/
    physics.js         monde de boîtes AABB : collisions, marches, rayons
    builder.js         fusion de la géométrie par matériau + collisions jumelées
    nuketown.js        la carte : maisons, véhicules, props, spawns, horloge
    nav.js             graphe de navigation échantillonné + plus courts chemins
  game/
    cheats.js          mod admin : état, aimbot, actions ponctuelles
    domination.js      mode Domination : drapeaux, capture, score, objectifs des bots
    streaks.js         avion espion, frappe mortier, hélicoptère de combat
    weapons.js         données d'armes, munitions, view model, recul caméra
    combat.js          hitscan, zones de dégâts, effets, grenades
    player.js          déplacement, caméra, tir, santé du joueur
    bots.js            perception → décision → navigation → visée → détente
    soldier.js         soldat low-poly animé (jambes, bras, visée, chute)
    match.js           équipes, spawns, dégâts, score, feed d'éliminations
  ui/
    admin.js           panneau du mod admin (interface générée depuis un schéma)
    esp.js             surcouche ESP projetée en 2D au-dessus de la scène
    hud.js             santé, munitions, feed, scores, indicateurs de dégâts
    minimap.js         mini-carte tournante rendue depuis les boîtes de collision
```

Quelques points techniques :

- **Géométrie fusionnée.** Chaque boîte de la carte est écrite dans un
  `BufferGeometry` par matériau (`src/world/builder.js`), ce qui ramène tout
  Nuketown à une vingtaine d'appels de rendu ; la même boîte enregistre son
  AABB dans le collisionneur, donc ce que l'on voit est exactement ce qui
  bloque les balles et les pas.
- **Collisions AABB** avec résolution axe par axe, marches (escaliers), plafonds
  et grille de *broadphase*.
- **Navigation** : les nœuds sont échantillonnés depuis la géométrie de
  collision (sol et étages), reliés par visibilité, complétés par des chaînes
  déclarées pour les escaliers, puis les composantes inaccessibles sont
  supprimées et tous les plus courts chemins sont précalculés.
- **Bots** : perception avec champ de vision et occultation, temps de réaction,
  erreur de visée qui se resserre sur la cible, rafales, mise à couvert quand
  ils rechargent ou sont bas en vie, grenades, et trois tempéraments
  (assaut, contournement, embuscade à la fenêtre).
- **Zéro asset** : les textures sont peintes sur des `canvas`, les sons sont
  synthétisés (bruit filtré + oscillateurs), l'horloge du site est une texture
  redessinée à chaque seconde avec le temps restant et le score.

## Licence

three.js est distribué sous licence MIT (voir `vendor/three-LICENSE.txt`).
Nuketown, Call of Duty et Black Ops sont des marques d'Activision ; ce projet
est un hommage non officiel, sans aucun asset d'origine.
