# Space Explorer Video Game
## Concept
I want a peaceful friendly browser based 2D hot seat game to play with my wife over ipad mini. The core idea of game comes from early stages of Civ5 when you can send out Explorer or Trireme to explore the world and it has adventures of finding other nations, natural wonders, ruins, fighting and running away from barbarians. All that while earning experience and gaining new abilities and strengths.

I think there is a lot of potential in that aspect that can be a game of it's own. As MVP on a pregenerated hex max with 1,000+ star systems player commands a single starship and earns experience points by exploring map in turns. Exploring single tile earns one expirence point, finding planets gives more, if inhabited even more, finding natural wonders (black holes, trinary systems) gives more experience points. Earning certain amount of experience points unlocks ship level and new abilities: more moves per turn, larger vision, more health, stronger attack.

Players start at home planet - Earth.

Finding anomalies gives random bonus: wormhole - move ship into random map spot, bulk experience points, local map, free ability.

Pirats are version of Civ 5 barbarians. Per certain area there is chance that a pirate base would spawn if none present. Pirate bases produce pirate ships every few turns until reach support capacity. Pirate ships roam the map attacking ships and planets.

## Approach
HTML5 Canvas based, where reasonable use external dependencies, but try to minimise their amount. Define multiple MVP steps each fully functional and develop iteratively. For graphics we will use my FreeCiv: Space tileset as basis, starfield becomes general tile background and can stay current hex or be modified for easier use. See inside images folder. That should be enough for initial MVP.
