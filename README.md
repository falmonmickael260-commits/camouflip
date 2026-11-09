# Maison Masquée — jeu local et hébergeable

Jeu Prop Hunt 3D multijoueur pour navigateur, développé avec Three.js, TypeScript, Vite et un serveur WebSocket Node.js. Il fonctionne en local et peut être hébergé sur un service Node unique. La base peut ensuite être emballée avec Capacitor pour Android et iOS, après validation sur appareils réels.

## Lancer le jeu

Sur ce Mac, vous pouvez aussi **double-cliquer sur `ouvrir-le-jeu.command`** dans Finder. Le lanceur démarre les services locaux et ouvre le navigateur. Gardez la fenêtre Terminal du lanceur ouverte pendant la partie.

Prérequis : Node.js 22.12+ et npm.

```bash
cd /Users/miick/code/prop-hunt-premium
npm install
```

Terminal 1, serveur multijoueur local :

```bash
cd /Users/miick/code/prop-hunt-premium
npm run server
```

Terminal 2, client web local :

```bash
cd /Users/miick/code/prop-hunt-premium
npm run dev
```

Sur le Mac, ouvrir **http://localhost:5173**. Choisir « Jouer avec 3 bots » pour tester seul, ou créer un salon et partager son code à **4 caractères**. En développement, le serveur utilise le port **8788** et Vite le port **5173**.

Pour tester exactement le mode à une seule adresse utilisé en hébergement :

```bash
npm run build
PORT=8790 npm start
```

Ouvrir ensuite **http://localhost:8790**. Ce serveur livre le jeu et les salons WebSocket sur le même port.

## Préparer Railway

Après avoir poussé le dépôt, créer **un service Node** à partir de ce dépôt dans Railway. Utiliser `npm run build` comme commande de construction et `npm start` comme commande de démarrage. Le serveur écoute la variable `PORT` fournie par Railway, sur `0.0.0.0`. Activer un domaine public dans Railway ; le navigateur utilisera automatiquement `wss://` sur ce même domaine. Le jeu lui-même n'a besoin ni de base de données ni de service cloud payant.

Garder **une seule réplique** du serveur : les salons et leurs codes sont actuellement conservés en mémoire. Un redémarrage efface les salons actifs. Le déploiement et la configuration du domaine restent à faire par le propriétaire du projet.

## Tester sur un téléphone du même Wi-Fi

1. Le Mac et le téléphone doivent être sur le même réseau Wi-Fi. Désactiver au besoin l'isolation des clients du routeur.
2. Sur le Mac, obtenir son adresse IP Wi-Fi :

   ```bash
   ipconfig getifaddr en0
   ```

3. Ouvrir **http://ADRESSE_IP_DU_MAC:5173** dans le navigateur du téléphone, en paysage. Les ports 5173 et 8788 doivent être autorisés par le pare-feu macOS si celui-ci le demande.
4. Créer un salon sur le Mac et rejoindre avec son code sur le téléphone. Le téléphone peut aussi créer un salon.

L'écran tactile utilise un joystick dynamique à gauche : posez le pouce où vous voulez dans la moitié gauche, puis poussez-le dans la direction voulue. Glissez un autre doigt dans la moitié droite pour orienter la caméra en même temps. Les boutons de transformation ou de tir, de verrouillage, de course et de visée pour le chasseur restent accessibles. Le bouton « SENSI » règle la vitesse de la caméra sur trois niveaux et mémorise le choix. « SON » coupe ou réactive la musique et les effets. La qualité « BASSE » est sélectionnée sur écran tactile ; le bouton en bas à droite permet de choisir une qualité supérieure.

Sur Mac : **ZQSD ou WASD** pour marcher, **Maj** pour courir, **souris** pour regarder, **E** pour se transformer, **F** pour verrouiller, **clic gauche** ou **Espace** pour tirer en chasseur, **clic droit maintenu** pour viser. Le premier clic capture le pointeur ; **Échap** le libère. Le clavier fonctionne dès le lancement de la manche.

Une notice de commandes apparaît au début de la première manche de chaque rôle. Elle explique l'objectif et les touches ou gestes adaptés à l'appareil. Elle se ferme avec « J'AI COMPRIS » ou automatiquement et se rouvre avec le bouton **?** ou la touche **H**.

## Règles jouables

- 2 à 7 participants au total, bots compris : un chasseur et jusqu'à six fugitifs. Le rôle tourne à chaque manche.
- 30 secondes de cachette avec chasseur immobilisé, puis 3 minutes de chasse.
- Les fugitifs apparaissent comme personnages animés, peuvent prendre l'apparence de 30 types d'objets proches, changer d'objet, se déplacer en objet et verrouiller leur position. Globe, guitare, panier à linge, lanterne et buffet bas complètent le catalogue. Le déguisement garde le modèle 3D exact de l'objet choisi. Le verrouillage tente d'aligner l'objet contre un mur ou sur sa position d'origine.
- Le chasseur joue en vue subjective avec une arme et une visée progressive. Deux impacts éliminent un fugitif ; un tir innocent retire 8 PV au chasseur.
- Les survivants gagnent à l'expiration du temps ou lorsque le chasseur perd tous ses PV. Le chasseur gagne s'il retrouve tout le monde.
- Positions, transformations, tirs, dégâts, scores, phases et résultats sont calculés ou validés par le serveur local.

## Structure

| Dossier / fichier | Rôle |
|---|---|
| `src/shared.ts` | Plan de la maison, objets identifiés, collisions et types réseau partagés |
| `src/scene.ts` | Architecture, mobilier original, matériaux, lumières et optimisation de géométrie |
| `src/character.ts` | Personnage articulé, marche avec pied d'appui, arme animée |
| `src/main.ts` | Rendu, caméra, entrées, réseau client, interface et effets |
| `src/camera-collision.ts` | Évitement des murs et meubles par la caméra à la troisième personne |
| `src/input-math.ts` | Zone morte et réponse du joystick tactile |
| `src/audio.ts` | Musiques CC0, bruitages enregistrés, mixage et transition entre phases |
| `ASSETS_AUDIO.md` | Origine et licences des fichiers audio locaux |
| `server/index.ts` | Salons, manches, bots, mouvement, autorité des tirs et résultats |
| `tests/` | Tests de géométrie, marche et scénarios multijoueurs |

## Vérification

```bash
npm run build
npm test
npm run test:match
```

Avec le serveur local déjà lancé :

```bash
npm run test:network
```

Avec Chrome installé sur ce Mac, le serveur et Vite déjà démarrés :

```bash
npm run test:browser
```

Le test de manche démarre son propre serveur temporaire sur le port 8799 et accélère les phases uniquement pour le test. Les tests de mouvement traversent le salon, la galerie et la cuisine en vérifiant les collisions. Le test Chrome vérifie les touches, la souris, le joystick et deux doigts simultanés, puis crée `controls-desktop.png` et `controls-mobile.png`. Il simule le tactile ; il ne remplace pas un test sur téléphone réel.

La capture `video-partie-premium.mp4` montre 27 secondes de cette version en format téléphone, avec le décor enrichi et le tableau de joueurs. L'enregistrement vidéo automatique n'inclut pas le son du jeu : ouvrez le jeu pour écouter les nouvelles pistes.

## État de cette version

Cette version est **jouable en local**. Les meubles sont des modèles 3D originaux composés et regroupés par matériau, avec 88 objets identifiés et 9 espaces dans une maison unique. Les pièces ont reçu des coussins, rideaux, cadres, vaisselle, fruits, livres, textiles, accessoires de salle de bains et rangements. Les petits détails sont réunis par matériau pour limiter les appels de rendu. Les animations de personnages sont générées par un rig articulé au code ; aucun clip glTF tiers n'est nécessaire pour marcher.

Deux nouvelles boucles musicales CC0 accompagnent le menu et la partie. La musique de chasse est feutrée pendant la cachette, puis s'ouvre au début de la chasse ; les actions importantes la baissent brièvement pour laisser entendre les bruitages. Une ambiance de réfrigérateur reste discrète près de la cuisine. Les pas et impacts utilisent des échantillons Kenney CC0 et les transformations des mouvements d'air enregistrés CC0, tous convertis en AAC pour les navigateurs mobiles ; leurs sources et licences figurent dans `ASSETS_AUDIO.md`. Un tableau en jeu affiche les noms, l'état et les points des sept joueurs maximum.

La finition reste à approfondir avant une sortie commerciale : matériaux texturés, animations d'interaction supplémentaires et bots plus rusés. Le chargement progressif et la compression de textures ne sont pas encore intégrés ; il n'y a actuellement pas de textures externes à compresser. L'objectif de 30 images/s **n'a pas été validé sur un iPhone ou Android physique**. Les trois qualités règlent la résolution et les ombres, mais un profilage sur téléphones de milieu de gamme reste nécessaire. Capacitor n'est pas encore installé et aucune application native n'a été produite.

Les modèles, couleurs et éléments d'interface sont créés dans le code du projet. Les fichiers audio tiers sont utilisés sous licence CC0 et conservés localement ; aucune ressource protégée sans autorisation n'est intégrée.
