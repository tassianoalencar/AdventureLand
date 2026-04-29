/**
  * ranger.js - Optimized & Self-Contained Ranger Script
  */

  var CONFIG = {
    MAX_GOLD: 500000,
    TARGETS: ["tortoise"],
    PRIORITY_TARGETS: ["phoenix"],
    MERCHANT: "MerchCruell",
    KITE_RADIUS: 40,
    MIN_FREE_SLOTS: 20,
    MIN_POTIONS: 50,
    AOE_ENABLED: false,
    REFILL_QUANTITY: 999,
    POTION_TYPES: ["hpot0", "mpot0"],
    MIN_HP: character.max_hp * 0.7,
    MIN_MP: character.max_mp * 0.3
  };

var estado = "farmando"; // "farmando" ou "esperando_merchant"
var pedidoSuprimentoEnviado = false;

// Configuração da Party
var PARTY_MEMBERS = ["RockStar", "CruellWR"];

function gerenciarParty() {
  if (character.name !== "MyCruell") return; // Apenas o líder convida

  for (var i = 0; i < PARTY_MEMBERS.length; i++) {
    var name = PARTY_MEMBERS[i];
    var pMember = parent.party[name];
    if (!pMember) {
      send_party_invite(name);
    }
  }
}

async function farmLoop() {
  try {

    if (character.rip || estado === "esperando_merchant") return;

    var target = get_targeted_monster();

    // 1. Procura por Alvos Prioritários Primeiro
    if (!target || target.dead || CONFIG.PRIORITY_TARGETS.indexOf(target.mtype) === -1) {
      for (var i = 0; i < CONFIG.PRIORITY_TARGETS.length; i++) {
        var pTarget = get_nearest_monster({ type: CONFIG.PRIORITY_TARGETS[i] });
        if (pTarget) {
          target = pTarget;
          change_target(target);
          break;
        }
      }
    }

    // 2. Procura por Alvos Padrão se não houver prioritário
    if (!target || target.dead || (CONFIG.TARGETS.indexOf(target.mtype) === -1 && CONFIG.PRIORITY_TARGETS.indexOf(target.mtype) === -1)) {
      for (var j = 0; j < CONFIG.TARGETS.length; j++) {
        var nTarget = get_nearest_monster({ type: CONFIG.TARGETS[j] });
        if (nTarget) {
          target = nTarget;
          change_target(target);
          break;
        }
      }
    }

    if (target) {
      var dist = distance(character, target);

      // --- MOVIMENTAÇÃO (Kiting Circular) ---
      if (dist < CONFIG.KITE_RADIUS || dist > character.range) {
        var angle = Math.atan2(character.y - target.y, character.x - target.x);
        var moveDist = character.range * 0.8;
        var newX = target.x + Math.cos(angle + 0.5) * moveDist;
        var newY = target.y + Math.sin(angle + 0.5) * moveDist;
        if (can_move_to(newX, newY)) move(newX, newY);
      }

      // --- LÓGICA DE ATAQUE ---
      var targets = Object.values(parent.entities).filter(function(entity) {
        return entity.type === "monster" &&
          (CONFIG.TARGETS.indexOf(entity.mtype) !== -1 || CONFIG.PRIORITY_TARGETS.indexOf(entity.mtype) !== -1) &&
          distance(character, entity) < character.range &&
          can_attack(entity);
      });

      if (targets.length >= 3 && CONFIG.AOE_ENABLED && can_use("3shot")) {
        await use_skill("3shot", [targets[0], targets[1], targets[2]]);
        reduce_cooldown("3shot", Math.min(...parent.pings))
      } else if (can_attack(target)) {
        await attack(target);
        reduce_cooldown("attack", Math.min(...parent.pings))
      }

      // Skill Supershot
      if (character.mp > 400 && can_use("supershot")) {
        await use_skill("supershot", target);
        reduce_cooldown("supershot", Math.min(...parent.pings))
      }

    } else if (!smart.moving) {
      smart_move(CONFIG.TARGETS[0]);
    }
  } catch(e) {
    console.error(e);
  }

  setTimeout(farmLoop, Math.max(100, parent.next_skill["attack"].getTime() - Date.now()))
}
farmLoop();

// --- FUNÇÕES DE SUPORTE ---

function getEmptySlots() {
  var empty = 0;
  for (var i = 0; i < character.items.length; i++) {
    if (!character.items[i]) empty++;
  }
  return empty;
}

function verificarInventario() {
  if (estado !== "farmando") return;

  if (getEmptySlots() <= CONFIG.MIN_FREE_SLOTS) {
    game_log("Inventário cheio! Chamando Merchant...");
    enviarPedidoMerchant('coletarItens');
  } else if (character.gold > CONFIG.MAX_GOLD) {
    game_log("Muito gold! Notificando Merchant...");
    enviarPedidoMerchant('coletarOuro');
  }
}

function verificarSuprimentos() {
  if (estado !== "farmando" || pedidoSuprimentoEnviado) return;

  var precisaDePotions = CONFIG.POTION_TYPES.some(function(id) {
    return quantity(id) < CONFIG.MIN_POTIONS;
  });

  if (precisaDePotions) {
    game_log("Poucas poções! Solicitando reabastecimento...");
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
    items: CONFIG.POTION_TYPES.map(function(id) {
      return { name: id, q: CONFIG.REFILL_QUANTITY };
    })
  });
  estado = "esperando_merchant";
}

function gerenciarRecursos() {
  if (character.rip) return;
  var should_heal = (typeof safeties === 'undefined' || safeties);
  if (should_heal && (character.hp < CONFIG.MIN_HP || character.mp < CONFIG.MIN_MP)) {
    use_hp_or_mp();
  }
}

// --- EVENTOS ---

character.on("cm", function(m) {
  if (m.name !== CONFIG.MERCHANT) return;

  var data = m.message || m.data;
  if (!data || data.action !== "cheguei") return;

  game_log("Merchant chegou! Transferindo...");

  if (character.gold > 5000) {
    send_gold(CONFIG.MERCHANT, character.gold - 5000);
  }

  for (var i = 0; i < 42; i++) {
    var item = character.items[i];
    if (item && CONFIG.POTION_TYPES.indexOf(item.name) === -1) {
      send_item(CONFIG.MERCHANT, i, item.q || 1);
    }
  }

  setTimeout(function() {
    send_cm(CONFIG.MERCHANT, { job: 'finalizado' });
    estado = "farmando";
    pedidoSuprimentoEnviado = false;
    game_log("Transferência concluída.");
  }, 2000);
});

// Loop de Gerenciamento (10s)
setInterval(function() {
  if (character.rip) {
    respawn();
    return;
  }
  verificarInventario();
  verificarSuprimentos();
  gerenciarParty();
}, 10000);

// Loop Principal
var _inter_ranger = setInterval(function() {
  if (character.rip) return;

  loot();
  gerenciarRecursos();

  clear_drawings();
  draw_circle(character.x, character.y, character.range, 2, "green");
}, 250);

// Cleanup (caso o script seja reiniciado)
if (typeof _last_inter_ranger !== 'undefined') clearInterval(_last_inter_ranger);
var _last_inter_ranger = _inter_ranger;
