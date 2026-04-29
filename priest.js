/**
 * priest.js - Optimized & Self-Contained Priest Script
 */

var CONFIG = {
    MAX_GOLD: 500000,
    TARGETS: ["tortoise"],
    PRIORITY_TARGETS: ["phoenix"],
    MERCHANT: "MerchCruell",
    LEADER: "MyCruell",
    FOLLOW_DIST: 200,
    MIN_FREE_SLOTS: 20,
    MIN_POTIONS: 50,
    REFILL_QUANTITY: 999,
    POTION_TYPES: ["hpot0", "mpot0"],
    MIN_HP: character.max_hp * 0.7,
    MIN_MP: character.max_mp * 0.7
};

var estado = "farmando";
var pedidoSuprimentoEnviado = false;

function farmLoop() {
    if (character.rip || estado === "esperando_merchant") return;

    var leader = get_player(CONFIG.LEADER);
    
    // Se não encontrar o líder por perto
    if (!leader) {
        if (!smart.moving) {
            game_log("Líder não encontrado. Movendo para o local de farm...");
            smart_move(CONFIG.TARGETS[0]); // Move para o spot dos monstros se o líder sumir
        }
        return;
    }

    var dist_to_leader = distance(character, leader);
    
    // Se o líder estiver longe ou em outro mapa
    if (dist_to_leader > 400 || character.map !== leader.map) {
        if (!smart.moving) {
            smart_move({ map: leader.map, x: leader.x, y: leader.y });
        }
        return;
    } else if (dist_to_leader > CONFIG.FOLLOW_DIST) {
        move(
            character.x + (leader.x - character.x) * 0.5,
            character.y + (leader.y - character.y) * 0.5
        );
    }

    // --- LÓGICA DE CURA ---
    var party_members = Object.values(parent.entities).filter(function(entity) { 
        return entity.type === "character" && 
               entity.party === character.party && 
               distance(character, entity) < character.range;
    });
    party_members.push(character);

    var most_hurt = party_members.sort(function(a, b) { return (a.hp/a.max_hp) - (b.hp/b.max_hp); })[0];

    if (most_hurt && most_hurt.hp / most_hurt.max_hp < 0.85) {
        if (can_use("heal")) {
            heal(most_hurt);
            return;
        }
    }

    // --- LÓGICA DE ATAQUE ---
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
        if (distance(character, target) > character.range && dist_to_leader < 300) {
            move(
                character.x + (target.x - character.x) * 0.6,
                character.y + (target.y - character.y) * 0.6
            );
        }

        if (can_use("curse") && target.hp > 1000) {
            use_skill("curse", target);
        }

        if (can_attack(target)) attack(target);
    }
}

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
        enviarPedidoMerchant('coletarItens');
    } else if (character.gold > CONFIG.MAX_GOLD) {
        enviarPedidoMerchant('coletarOuro');
    }
}

function verificarSuprimentos() {
    if (estado !== "farmando" || pedidoSuprimentoEnviado) return;
    var precisaDePotions = CONFIG.POTION_TYPES.some(function(id) {
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

function on_party_invite(name) {
    if (name === CONFIG.LEADER) accept_party_invite(name);
}

character.on("cm", function(m) {
    if (m.name !== CONFIG.MERCHANT) return;
    var data = m.message || m.data;
    if (!data || data.action !== "cheguei") return;

    if (character.gold > 5000) send_gold(CONFIG.MERCHANT, character.gold - 5000);
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
}, 10000);

// Loop Principal (250ms)
var _inter_priest = setInterval(function() {
    if (character.rip) return;
    loot();
    gerenciarRecursos();
    farmLoop();
}, 250);

if (typeof _last_inter_priest !== 'undefined') clearInterval(_last_inter_priest);
var _last_inter_priest = _inter_priest;