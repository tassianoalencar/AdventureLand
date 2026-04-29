/**
 * priest.js - clone do ranger com comportamento de healer
 */

var CONFIG = {
  MAX_GOLD: 500000,
  TARGETS: ["squig"],
  PRIORITY_TARGETS: ["phoenix"],
  MERCHANT: "MerchCruell",

  PARTY: ["MyCruell", "RockStar", "CruellWR"],

  MIN_FREE_SLOTS: 1,
  MIN_POTIONS: 50,
  REFILL_QUANTITY: 999,
  POTION_TYPES: ["hpot1", "mpot1"],

  MIN_HP: character.max_hp * 0.7,
  MIN_MP: character.max_mp * 0.3
};

var estado = "farmando";
var pedidoSuprimentoEnviado = false;

// ================== HELPERS ==================
function getLowest() {
  let lowest = null;
  let ratio = 1;

  for (let name of CONFIG.PARTY) {
    let p = get_player(name);
    if (!p) continue;

    let r = p.hp / p.max_hp;
    if (r < ratio) {
      ratio = r;
      lowest = p;
    }
  }

  return lowest;
}

// ================== FARM LOOP ==================
async function farmLoop() {
  try {

    if (character.rip) {
      estado = "farmando";
      pedidoSuprimentoEnviado = false;

      respawn();

      setTimeout(() => {
        smart_move(CONFIG.TARGETS[0]);
      }, 1500);

      return setTimeout(farmLoop, 1000);
    }

    if (estado === "esperando_merchant") return;

    // 🧠 HEAL PRIORITY (ANTES DE TUDO)

    // self
    if (character.hp / character.max_hp < 0.7 && can_use("heal")) {
      await heal(character);
      return;
    }

    // party
    let low = getLowest();
    if (low && low.hp / low.max_hp < 0.6 && can_use("heal")) {
      await heal(low);
      return;
    }

    // party heal
    if (can_use("partyheal")) {
      await use_skill("partyheal");
    }

    // ================== COMBATE (igual ranger, mas leve)
    var target = get_targeted_monster();

    if (!target || target.dead || CONFIG.PRIORITY_TARGETS.indexOf(target.mtype) === -1) {
      for (let type of CONFIG.PRIORITY_TARGETS) {
        let t = get_nearest_monster({ type });
        if (t) {
          target = t;
          change_target(t);
          break;
        }
      }
    }

    if (!target || target.dead ||
      (CONFIG.TARGETS.indexOf(target.mtype) === -1 &&
       CONFIG.PRIORITY_TARGETS.indexOf(target.mtype) === -1)) {

      for (let type of CONFIG.TARGETS) {
        let t = get_nearest_monster({ type });
        if (t) {
          target = t;
          change_target(t);
          break;
        }
      }
    }

    if (target && can_attack(target)) {
      await attack(target);
      reduce_cooldown("attack", Math.min(...parent.pings));
    } else if (!smart.moving) {
      smart_move(CONFIG.TARGETS[0]);
    }

  } catch(e) {
    console.error(e);
  }

  setTimeout(farmLoop, Math.max(100, parent.next_skill["attack"].getTime() - Date.now()));
}
farmLoop();


// ================== INVENTÁRIO ==================
function getEmptySlots() {
  return character.items.filter(i => !i).length;
}

function verificarInventario() {
  if (estado !== "farmando") return;

  if (getEmptySlots() <= CONFIG.MIN_FREE_SLOTS) {
    enviarPedidoMerchant("collect_items");
  } else if (character.gold > CONFIG.MAX_GOLD) {
    enviarPedidoMerchant("collect_gold");
  }
}

function verificarSuprimentos() {
  if (estado !== "farmando" || pedidoSuprimentoEnviado) return;

  const precisa = CONFIG.POTION_TYPES.some(id => quantity(id) < CONFIG.MIN_POTIONS);

  if (precisa) {
    enviarPedidoMerchant("supply");
    pedidoSuprimentoEnviado = true;
  }
}

// ================== COMM ==================
function enviarPedidoMerchant(tipo) {
  if (estado === "esperando_merchant") return;

  let payload = {
    type: tipo,
    map: character.map,
    x: character.x,
    y: character.y
  };

  if (tipo === "supply") {
    payload.items = CONFIG.POTION_TYPES
      .map(id => {
        let need = CONFIG.REFILL_QUANTITY - quantity(id);
        return need > 0 ? { name: id, q: need } : null;
      })
      .filter(Boolean);
  }

  send_cm(CONFIG.MERCHANT, payload);
  estado = "esperando_merchant";
}

// ================== EVENTOS ==================
character.on("cm", (m) => {
  if (m.name !== CONFIG.MERCHANT) return;

  const data = m.message;

  if (data?.type === "arrived") {

    // 💰 GOLD
    if (character.gold > 5000) {
      send_gold(CONFIG.MERCHANT, character.gold - 5000);
    }

    // 📦 ITEMS
    for (let i = 0; i < character.items.length; i++) {
      let item = character.items[i];
      if (item && !CONFIG.POTION_TYPES.includes(item.name)) {
        send_item(CONFIG.MERCHANT, i, item.q || 1);
      }
    }

    setTimeout(() => {
      send_cm(CONFIG.MERCHANT, { type: "done" });

      estado = "farmando";
      pedidoSuprimentoEnviado = false;

      clear_target();
      smart_move(CONFIG.TARGETS[0]);

    }, 1000);
  }
});

// ================== LOOPS ==================
setInterval(() => {
  if (!character.rip) {
    verificarInventario();
    verificarSuprimentos();
  }
}, 5000);

setInterval(() => {
  if (character.rip) return;

  loot();

  if (character.hp < CONFIG.MIN_HP || character.mp < CONFIG.MIN_MP) {
    use_hp_or_mp();
  }

  // 🎯 DRAW
  clear_drawings();
  draw_circle(character.x, character.y, character.range, 2, "green");

}, 250);