/**
 * ranger.js - FINAL (com respawn + recovery)
 */

// ================== CONFIG ==================
const CONFIG = {
  MAX_GOLD: 500000,
  TARGETS: ["squig","squigtoad"],
  PRIORITY_TARGETS: ["phoenix"],
  MERCHANT: "MerchCruell",

  KITE_RADIUS: 40,
  KITE_ENABLED: true,

  MIN_FREE_SLOTS: 1,
  MIN_POTIONS: 50,

  AOE_ENABLED: true,

  REFILL_QUANTITY: 999,
  POTION_TYPES: ["hpot1", "mpot1"],

  MIN_HP: character.max_hp * 0.7,
  MIN_MP: character.max_mp * 0.7
};

// ================== STATE ==================
let estado = "farmando";
let pedidoSuprimentoEnviado = false;

// ================== FARM LOOP ==================
async function farmLoop() {
  try {

    // 💀 MORTE (FIX PRINCIPAL)
    if (character.rip) {
      estado = "farmando";
      pedidoSuprimentoEnviado = false;

      respawn();

      // volta pro spot depois de reviver
      setTimeout(() => {
        smart_move(CONFIG.TARGETS[0]);
      }, 1500);

      return setTimeout(farmLoop, 1000);
    }

    // 👇 mantém loop vivo enquanto espera merchant
    if (estado === "esperando_merchant") {
      return setTimeout(farmLoop, 250);
    }

    let target = get_targeted_monster();

    // ================== PRIORITY ==================
    if (!target || target.dead || !CONFIG.PRIORITY_TARGETS.includes(target.mtype)) {
      for (let type of CONFIG.PRIORITY_TARGETS) {
        let t = get_nearest_monster({ type });
        if (t) {
          target = t;
          change_target(t);
          break;
        }
      }
    }

    // ================== NORMAL ==================
    if (!target || target.dead ||
      (!CONFIG.TARGETS.includes(target.mtype) &&
       !CONFIG.PRIORITY_TARGETS.includes(target.mtype))) {

      for (let type of CONFIG.TARGETS) {
        let t = get_nearest_monster({ type });
        if (t) {
          target = t;
          change_target(t);
          break;
        }
      }
    }

    if (target) {
      const dist = distance(character, target);

      // ================== KITE ==================
      if (CONFIG.KITE_ENABLED) {
        if (dist < CONFIG.KITE_RADIUS || dist > character.range) {
          const angle = Math.atan2(character.y - target.y, character.x - target.x);
          const moveDist = character.range * 0.8;

          const newX = target.x + Math.cos(angle + 0.5) * moveDist;
          const newY = target.y + Math.sin(angle + 0.5) * moveDist;

          if (can_move_to(newX, newY)) {
            move(newX, newY);
          }
        }
      }

      // ================== ATAQUE ==================
      const targets = Object.values(parent.entities).filter(e =>
        e.type === "monster" &&
        (CONFIG.TARGETS.includes(e.mtype) || CONFIG.PRIORITY_TARGETS.includes(e.mtype)) &&
        distance(character, e) < character.range &&
        can_attack(e)
      );

      if (targets.length >= 3 && CONFIG.AOE_ENABLED && can_use("3shot")) {
        await use_skill("3shot", targets.slice(0, 3));
        reduce_cooldown("3shot", Math.min(...parent.pings));
      } else if (can_attack(target)) {
        await attack(target);
        reduce_cooldown("attack", Math.min(...parent.pings));
      }

      if (character.mp > 400 && can_use("supershot")) {
        await use_skill("supershot", target);
        reduce_cooldown("supershot", Math.min(...parent.pings));
      }

    } else {
      // 🚶 fallback → garante que nunca fica parado
      if (!smart.moving) {
        smart_move(CONFIG.TARGETS[0]);
      }
    }

  } catch (e) {
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