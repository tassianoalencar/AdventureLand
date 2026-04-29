/* eslint-disable no-undef */

// ================== CONFIG ==================
const CONFIG = {
  potion_npc: { map: "main", x: -204, y: -91 },
  store_spot: { map: "main", x: 10, y: 10 },
  min_potion_stock: 5000,
  exchange_npc: { map: "main", x: -21, y: -429 },
  exchange_items: [
    { name: "gem0", min: 1 }
  ],
  sell_npc: { map: "main", x: -75, y: -110 }, // NPC vendedor (ajuste se quiser)
  sell_trash: [
    "slimestaff",
    "hpamulet",
    "ringsj",
    "hpbelt"
  ],
  upgrade_npc: { map: "main", x: -204, y: -91 }, // mesmo npc das potions (upgrade)
  upgrade_items: {
    fireblade: 6,
    firebow: 6,
    wcap: 7,
    basher: 7
  },
  upgrade_scrolls: {
    0: "scroll0",
    1: "scroll0",
    2: "scroll0",
    3: "scroll1",
    4: "scroll1",
    5: "scroll1",
    6: "scroll2",
    7: "scroll2"
  }
};

const my_characters = ['MyCruell', 'RockStar', 'CruellWR'];

// ================== STATE ==================
const state = {
  queue: [],
  current: null,
  running: false,
};

// ================== HELPERS ==================
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function addJob(type, data = {}) {
  state.queue.push({ type, data });
}

function addPriorityJob(type, data = {}) {
  state.queue.unshift({ type, data });
}

async function ensureScroll(scrollName, amount = 10) {
  let index = character.items.findIndex(i => i && i.name === scrollName);

  if (index !== -1) return index;

  // vai até npc
  await smart_move(CONFIG.potion_npc);
  await sleep(300);

  await buy(scrollName, amount);
  await sleep(300);

  return character.items.findIndex(i => i && i.name === scrollName);
}

function getScrollForItem(item) {
  const gItem = G.items[item.name];
  if (!gItem) return null;

  const grades = gItem.grades || [0, 3, 6, 9];
  const tier = gItem.tier || 1;

  let scroll;

  if (item.level < grades[1]) scroll = 0;
  else if (item.level < grades[2]) scroll = 1;
  else if (item.level < grades[3]) scroll = 2;
  else scroll = 3;

  // 🔥 aplica mínimo por tier
  scroll = Math.max(scroll, tier - 1);

  return "scroll" + scroll;
}

async function applyLuckBuff(playerName) {
  const target = get_player(playerName);
  if (!target) return;

  // verifica se já tem buff
  const buff = target.s?.mluck;

  // se não tem ou está acabando (< 30s)
  if (!buff || buff.ms < 30000) {
    if (can_use("mluck")) {
      await use_skill("mluck", playerName);
      await sleep(200);
      game_log(`Buff mluck aplicado em ${playerName}`);
    }
  }
}

// ================== JOB HANDLERS ==================
const jobHandlers = {};

// ================== SUPPLY ==================
jobHandlers.supply = async (data) => {
  const { name, map, x, y, items } = data;

  if (character.stand) {
    parent.close_merchant(41);
    await sleep(300);
  }

  await smart_move({ map, x, y });

  // 🧠 BUFF AQUI
  await applyLuckBuff(name);

  send_cm(name, { type: "arrived" });
  await sleep(500);

  for (let req of items || []) {
    let remaining = req.q;

    while (remaining > 0) {
      let index = character.items.findIndex(i => i && i.name === req.name);

      if (index === -1) break;

      let item = character.items[index];
      let amount = Math.min(item.q || 1, remaining);

      send_item(name, index, amount);
      remaining -= amount;

      await sleep(200);
    }
  }
};

// ================== COLLECT GOLD ==================
jobHandlers.collect_gold = async (data) => {
  const { name, map, x, y } = data;

  if (character.stand) {
    parent.close_merchant(41);
    await sleep(300);
  }

  await smart_move({ map, x, y });

  // 🧠 BUFF
  await applyLuckBuff(name);

  send_cm(name, { type: "arrived" });
};

// ================== COLLECT ITEMS ==================
jobHandlers.collect_items = async (data) => {
  const { name, map, x, y } = data;

  if (character.stand) {
    parent.close_merchant(41);
    await sleep(300);
  }

  await smart_move({ map, x, y });

  // 🧠 BUFF
  await applyLuckBuff(name);

  send_cm(name, { type: "arrived" });
};

// ================== OPEN STORE ==================
jobHandlers.open_store = async () => {
  if (character.stand) return;

  await smart_move(CONFIG.store_spot);
  await sleep(300);

  parent.open_merchant(41);
};

// ================== RESTOCK POTIONS ==================
jobHandlers.restock_potions = async () => {
  const POTIONS = ["hpot1", "mpot1"];
  const POTION_PRICE = 100;

  // ================== CALCULAR NECESSIDADE ==================
  let totalCost = 0;
  let needs = {};

  for (let pot of POTIONS) {
    const current = quantity(pot);
    const needed = Math.max(0, CONFIG.min_potion_stock - current);

    if (needed > 0) {
      needs[pot] = needed;
      totalCost += needed * POTION_PRICE;
    }
  }

  if (totalCost === 0) {
    return; // já tem estoque suficiente
  }

  // ================== FECHAR LOJA ==================
  if (character.stand) {
    parent.close_merchant(41);
    await sleep(300);
  }

  // ================== PEGAR GOLD NO BANCO ==================
  if (character.gold < totalCost) {
    await smart_move("bank");
    await sleep(500);

    let missing = totalCost - character.gold;

    // tenta sacar o necessário
    parent.socket.emit("bank", {
      operation: "withdraw",
      amount: missing
    });

    await sleep(500);
  }

  // ================== IR PARA NPC ==================
  await smart_move(CONFIG.potion_npc);
  await sleep(500);

  // ================== COMPRAR ==================
  for (let pot in needs) {
    let remaining = needs[pot];

    while (remaining > 0) {
      let buyAmount = Math.min(9999, remaining);

      await buy(pot, buyAmount);

      remaining -= buyAmount;
      await sleep(200);
    }

    game_log(`Comprado ${needs[pot]} de ${pot}`);
  }
};

// ================== EXCHANGE ITEMS ==================
jobHandlers.exchange_items = async () => {
  const ITEMS = CONFIG.exchange_items;

  const hasItems = ITEMS.some(cfg => quantity(cfg.name) >= (cfg.min || 1));
  if (!hasItems) return;

  if (character.stand) {
    parent.close_merchant(41);
    await sleep(300);
  }

  await smart_move(CONFIG.exchange_npc);
  await sleep(500);

  for (let cfg of ITEMS) {
    let min = cfg.min || 1;

    while (quantity(cfg.name) >= min) {

      // ⛔ espera terminar exchange atual
      while (character.q.exchange) {
        await sleep(200);
      }

      let index = character.items.findIndex(i => i && i.name === cfg.name);
      if (index === -1) break;

      exchange(index);

      // ⛔ espera iniciar e terminar
      await sleep(300);

      while (character.q.exchange) {
        await sleep(200);
      }
    }

    game_log(`Exchange completo: ${cfg.name}`);
  }
};

// ================== SELL TRASH ==================
jobHandlers.sell_trash = async () => {
  const TRASH = CONFIG.sell_trash;

  // verifica se tem algo pra vender
  const hasTrash = character.items.some(i => i && TRASH.includes(i.name));
  if (!hasTrash) return;

  // fecha loja
  if (character.stand) {
    parent.close_merchant(41);
    await sleep(300);
  }

  // vai até o npc
  await smart_move(CONFIG.sell_npc);
  await sleep(500);

  // vende itens
  for (let i = 0; i < character.items.length; i++) {
    const item = character.items[i];
    if (!item) continue;

    if (TRASH.includes(item.name)) {
      sell(i, item.q || 1);
      await sleep(150);
    }
  }

  game_log("Itens lixo vendidos");
};

// ================== UPGRADE ITEMS ==================
jobHandlers.upgrade_items = async () => {

  const ITEMS = CONFIG.upgrade_items;

  const hasUpgradable = character.items.some(item =>
    item && ITEMS[item.name] !== undefined && item.level < ITEMS[item.name]
  );

  if (!hasUpgradable) return;

  if (character.stand) {
    parent.close_merchant(41);
    await sleep(300);
  }

  await smart_move(CONFIG.upgrade_npc);
  await sleep(500);

  for (let i = 0; i < character.items.length; i++) {
    let item = character.items[i];
    if (!item) continue;

    let maxLevel = ITEMS[item.name];
    if (maxLevel === undefined) continue;

    while (item && item.level < maxLevel) {

      // espera upgrade atual
      while (character.q.upgrade) {
        await sleep(200);
      }

      const scrollName = getScrollForItem(item);

      let scrollIndex = character.items.findIndex(i => i && i.name === scrollName);

      // 🔥 COMPRA AUTOMÁTICA
      if (scrollIndex === -1) {
        scrollIndex = await ensureScroll(scrollName, 10);

        if (scrollIndex === -1) {
          game_log(`Falha ao obter ${scrollName}`);
          break;
        }
      }

      upgrade(i, scrollIndex);

      await sleep(300);

      while (character.q.upgrade) {
        await sleep(200);
      }

      item = character.items[i];
    }
  }

  game_log("Upgrade finalizado");
};

// ================== JOB RUNNER ==================
async function jobRunner() {
  if (state.running) return;
  if (state.queue.length === 0) return;

  state.running = true;
  state.current = state.queue.shift();

  try {
    const handler = jobHandlers[state.current.type];
    if (handler) {
      await handler(state.current.data);
    }
  } catch (e) {
    console.error(e);
  }

  state.current = null;
  state.running = false;
}

setInterval(jobRunner, 400);

// ================== AUTO ==================
setInterval(() => {
  const POTIONS = ["hpot1", "mpot1"];
  const needsRestock = POTIONS.some(pot => quantity(pot) < CONFIG.min_potion_stock);
  const canExchange = CONFIG.exchange_items.some(cfg => quantity(cfg.name) >= (cfg.min || 1));
  const TRASH = CONFIG.sell_trash;
  const hasTrash = character.items.some(i => i && TRASH.includes(i.name));

  const hasUpgradable = character.items.some(item =>
    item &&
    CONFIG.upgrade_items[item.name] !== undefined &&
    item.level < CONFIG.upgrade_items[item.name]
  );

  if (hasUpgradable && !state.running) {
    addJob("upgrade_items");
  }

  if (hasTrash && !state.running) {
    addJob("sell_trash");
  }

  if (canExchange && !state.running) {
    addJob("exchange_items");
  }

  if (needsRestock && !state.running) {
    addJob("restock_potions");
  }

  if (!state.running && state.queue.length === 0) {
    addJob("open_store");
  }
}, 3000);

// ================== EVENTS ==================
character.on("cm", (m) => {
  if (!my_characters.includes(m.name)) return;

  const data = m.message;
  if (!data) return;

  if (data.type === "collect_gold") {
    addPriorityJob("collect_gold", { ...data, name: m.name });
  }

  if (data.type === "collect_items") {
    addPriorityJob("collect_items", { ...data, name: m.name });
  }

  if (data.type === "supply") {
    addPriorityJob("supply", { ...data, name: m.name });
  }

  if (data.type === "done") {
    // terminou atendimento → volta pra loja
    addJob("open_store");
  }
});

function on_party_invite(name) {
  if (name === 'CruellWR') {
	  accept_party_invite(name)
  }
}