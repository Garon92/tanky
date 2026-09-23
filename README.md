# Tanky

Tahová tanková bitva pro celou rodinu – zamiř, nastav sílu, vystřel a přechytrač soupeře.
Běží v prohlížeči na počítači, tabletu i mobilu (ideálně na šířku), funguje i offline (PWA).

**Hra:** https://garon92.github.io/tanky/

## Režimy

- **Tažení** – 20 ručně navržených úrovní v 6 světech (Louka, Poušť, Sníh, Noc, Měsíc a sopka, Výzvy).
  Hvězdičky za počet výstřelů, odemykání dalších úrovní, 3 obtížnosti. První úroveň je výuková.
- **Souboj** – 2 až 4 tanky na jedné obrazovce; každý je hráč nebo bot (🐢 / 🐇 / 🔥), i ve dvou týmech
  (🔴🟢 proti 🔵🟡 – rodič s dítětem proti botům).
  Nastavení: počet výher, životy (i klasický „jeden zásah“), vítr, bedny, odrazné okraje, prostředí.
  Pomocná čára pro každého hráče zvlášť – kdo vede, má ji kratší (handicap z původní hry).
- **Přežití** – nekonečné vlny nepřátel na padácích, mezi vlnami výběr odměny, rekord.
- **Střelnice** – pro nejmenší: 12 ran na balónky, terče, ptáky a UFO, kombo za více cílů jednou ranou.

## Ovládání

| | Klávesnice | Dotyk / myš |
|---|---|---|
| Otáčení hlavně | ← → nebo A D | táhni po bojišti – hlaveň míří k prstu |
| Síla | ↑ ↓ nebo W S (kolečko myši) | čím dál od tanku, tím silněji; tlačítka ▲ ▼ |
| Výstřel | mezerník / Enter | tlačítko **PAL!** |
| Jízda (palivo) | Q E | šipky u ukazatele paliva |
| Zbraň | Tab, 1–9 | tlačítko zbraně vlevo dole |
| Jemné míření | drž Shift | |
| Pauza | Esc / P | ⏸ vlevo nahoře |
| Celá obrazovka / zvuk | F / M | lišta nahoře |

Gamepad: levá páčka míří, A střílí, LB/RB mění zbraň, spouště jezdí, Start = pauza.

## Zbraně a bojiště

Střela, Velká bomba, Trojstřela, Skákačka, Válec, Ohňostroj, Krtek, Hlína, Chytrá raketa, Nálet, Megabomba.
Terén je zničitelný (krátery, tanky padají), bedny s padákem dávají opravu, štít, palivo nebo zbraně.
Překážky: kámen a kov (nezničitelné), dřevěné bedny, trampolíny, kouzelné brány, voda a láva, vítr.
Přerušovaná čára ukazuje dráhu posledního výstřelu, tečky místa dopadu. Tahy botů jde zrychlit (⏩).
19 odznaků a statistiky najdeš na úvodní obrazovce.

## Vývoj

Vite + TypeScript (strict), bez frameworku. Sdílený design systém g92 je vendorovaný v `src/kit/`
(needitovat – mění se v repu `menu` a synchronizuje skriptem `menu/kit/sync.sh`).

```bash
npm install
npm run dev        # http://localhost:5174/tanky/
npm test           # Vitest – terén, fyzika, poškození, AI, úrovně, průběh hry
npm run typecheck
npm run build      # výstup v dist/ (včetně service workeru)
npm run preview
```

Statistiky vyváženosti botů: `SLOW=1 npx vitest run tests/balance.slow.test.ts`.

### Struktura

- `src/core/` – smyčka s pevným krokem (120 Hz), vstup (klávesnice, gamepad), RNG, ukládání
- `src/game/` – terén, fyzika střel, zbraně, tanky, svět, AI botů, úrovně, pravidla režimů
- `src/render/` – kamera, pozadí a terén (cache), sprity, částice, ambientní „easter eggy“
- `src/audio/` – syntetizované zvuky (WebAudio)
- `src/ui/` – HUD, obrazovky, ikony, míření dotykem
- `tests/` – Vitest

Nasazení: GitHub Actions (`.github/workflows/deploy.yml`) – build a `actions/deploy-pages` při pushi do `main`.
