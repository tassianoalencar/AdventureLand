const CONFIG = {
  MAX_GOLD: 500_000,
  TARGETS: ["tortoise"],
  PRIORITY_TARGETS: ["phoenix"],
  MERCHANT: "MerchCruell",
  LEADER: "MyCruell",
  FOLLOW_DIST: 35,
  MIN_FREE_SLOTS: 5,
  MIN_POTIONS: 50,
  REFILL_QUANTITY: 500,
  POTION_TYPES: ["hpot0", "mpot0"],
  MIN_HP: character.max_hp * 0.7,
  MIN_MP: character.max_mp * 0.4
};

let estado = "farmando";
let pedidoSuprimentoEnviado = false;
let target_geral = null;

async function warriorLoop() {
  try {
    if (character.rip || estado === "esperando_merchant") return;

    let target = get_targeted_monster();

    // 1. Procura por Alvos Prioritários Primeiro
    if (!target || target.dead || CONFIG.PRIORITY_TARGETS.indexOf(target.mtype) === -1) {
      for (let i = 0; i < CONFIG.PRIORITY_TARGETS.length; i++) {
        let pTarget = get_nearest_monster({ type: CONFIG.PRIORITY_TARGETS[i] });
        if (pTarget) {
          target = pTarget;
          change_target(target);
          break;
        }
      }
    }

    // 2. Procura por Alvos Padrão se não houver prioritário
    if (!target || target.dead || (CONFIG.TARGETS.indexOf(target.mtype) === -1 && CONFIG.PRIORITY_TARGETS.indexOf(target.mtype) === -1)) {
      for (let j = 0; j < CONFIG.TARGETS.length; j++) {
        let nTarget = get_nearest_monster({ type: CONFIG.TARGETS[j] });
        if (nTarget) {
          target = nTarget;
          change_target(target);
          break;
        }
      }
    }

    if (target) {
      target_geral = target;

      // Taunt
      if (can_use("taunt") && distance(character, target) < 200) {
        await use_skill("taunt", target);
        reduce_cooldown("taunt", Math.min(...parent.pings))
      }

      if (can_attack(target)) {
        await attack(target);
        reduce_cooldown("attack", Math.min(...parent.pings))
      }
    }
  } catch (e) {
    console.error(e);
  }

  setTimeout(warriorLoop, Math.max(100, parent.next_skill['attack'].getTime() - Date.now()));

}
warriorLoop();

let orbitAngle = 0;
async function loopMovimento() {
  if (!target_geral) return;
  if (character.rip || estado != 'farmando') return;

  try {
    orbitAngle += 0.25;

    // Ajusta o raio da órbita para estar sempre ao alcance do ataque
    let radius = Math.min(25, character.range - 2);

    let newX = target_geral.x + Math.cos(orbitAngle) * radius;
    let newY = target_geral.y + Math.sin(orbitAngle) * radius;

    if (can_move_to(newX, newY)) {
        move(newX, newY); // move é mais leve que xmove para micro-movimentos
    }
  } catch(e) {
    console.error(e);
  }

  setTimeout(loopMovimento, 100);
}
loopMovimento();

// --- FUNÇÕES DE SUPORTE ---
function getEmptySlots() {
  let empty = 0;
  for (let i = 0; i < character.items.length; i++) {
    if (!character.items[i]) empty++;
  }
  return empty;
}

function verificarInventario() {
  if (estado !== "farmando") return;
  if (getEmptySlots() <= CONFIG.MIN_FREE_SLOTS) {
    enviarPedidoMerchant('coletarItens');
  } else if (character.gold > CONFIG.MAX_GOLD) {
    enviarPedidoMerchant('coletarOuro');
  }
}

function verificarSuprimentos() {
  if (estado !== "farmando" || pedidoSuprimentoEnviado) return;
  let precisaDePotions = CONFIG.POTION_TYPES.some(function (id) {
    return quantity(id) < CONFIG.MIN_POTIONS;
  });
  if (precisaDePotions) {
    enviarPedidoMerchant('reabastecer');
    pedidoSuprimentoEnviado = true;
  }
}

function enviarPedidoMerchant(tipoJob) {
  send_cm(CONFIG.MERCHANT, {
    job: tipoJob,
    map: character.map,
    x: character.x,
    y: character.y,
    items: CONFIG.POTION_TYPES.map(function (id) {
      return { name: id, q: CONFIG.REFILL_QUANTITY };
    })
  });
  estado = "esperando_merchant";
}

function gerenciarRecursos() {
  if (character.rip) return;
  let should_heal = (typeof safeties === 'undefined' || safeties);
  if (should_heal && (character.hp < CONFIG.MIN_HP || character.mp < CONFIG.MIN_MP)) {
    use_hp_or_mp();
  }
}

// --- EVENTOS ---

function on_party_invite(name) {
  if (name === CONFIG.LEADER) accept_party_invite(name);
}

character.on("cm", function (m) {
  if (m.name !== CONFIG.MERCHANT) return;
  let data = m.message || m.data;
  if (!data || data.action !== "cheguei") return;

  if (character.gold > 5000) send_gold(CONFIG.MERCHANT, character.gold - 5000);
  for (let i = 0; i < 42; i++) {
    let item = character.items[i];
    if (item && CONFIG.POTION_TYPES.indexOf(item.name) === -1) {
      send_item(CONFIG.MERCHANT, i, item.q || 1);
    }
  }
  setTimeout(function () {
    send_cm(CONFIG.MERCHANT, { job: 'finalizado' });
    estado = "farmando";
    pedidoSuprimentoEnviado = false;
  }, 2000);
});

// Loop de Gerenciamento (10s)
setInterval(function () {
  if (character.rip) {
    respawn();
    return;
  }
  verificarInventario();
  verificarSuprimentos();
}, 10000);

// Loop Principal (250ms)
let _inter_warrior = setInterval(function () {
  if (character.rip) return;
  loot();
  gerenciarRecursos();
}, 250);

if (typeof _last_inter_warrior !== 'undefined') clearInterval(_last_inter_warrior);
var _last_inter_warrior = _inter_warrior;
