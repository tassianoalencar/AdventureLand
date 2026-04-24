const CONFIG = {
    MAX_GOLD: 500000,
    TARGET: "tortoise",
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

let estado = "farmando"; // "farmando" ou "esperando_merchant"
let pedidoSuprimentoEnviado = false;

if (!character.party) {
    send_party_invite("RockStar");
	send_party_invite("CruellWR");
}

// Função principal de ataque e movimento
function farmLoop() {
    if (character.rip || estado === "esperando_merchant") return;

    let target = get_targeted_monster();
    
    // Procura novo alvo se necessário
    if (!target || target.dead || target.mtype !== CONFIG.TARGET) {
        target = get_nearest_monster({ type: CONFIG.TARGET });
        if (target) change_target(target);
    }

    if (target) {
        const dist = distance(character, target);
        
        // --- MOVIMENTAÇÃO (Kiting Circular) ---
        if (dist < CONFIG.KITE_RADIUS || dist > character.range) {
            let angle = Math.atan2(character.y - target.y, character.x - target.x);
            // Calcula uma posição circular ao redor do monstro
            let newX = target.x + Math.cos(angle + 0.5) * (character.range * 0.8);
            let newY = target.y + Math.sin(angle + 0.5) * (character.range * 0.8);
            if (can_move_to(newX, newY)) move(newX, newY);
        }

        // --- LÓGICA DE ATAQUE ---
        // Busca alvos próximos para o 3-shot
        let targets = Object.values(parent.entities).filter(entity => 
            entity.type === "monster" && 
            entity.mtype === CONFIG.TARGET &&
            distance(character, entity) < character.range &&
            can_attack(entity)
        );

        if (targets.length >= 3 && CONFIG.AOE_ENABLED && can_use("3shot")) {
            use_skill("3shot", [targets[0], targets[1], targets[2]]);
        } else if (can_attack(target)) {
            attack(target);
        }
        
    } else if (!smart.moving) {
        // Se não houver alvo, vai até o spot do monstro
        smart_move(CONFIG.TARGET);
    }
}

// Verifica se o inventário está cheio
function verificarInventario() {
    if (estado !== "farmando") return;

    if (getEmptySlots() <= CONFIG.MIN_FREE_SLOTS) {
        game_log("Inventário cheio! Chamando Merchant...");
        enviarPedidoMerchant('coletarItens');
    }
}

// Verifica se o gold está alto
function verificarOuro() {
    if (estado === "farmando" && character.gold > CONFIG.MAX_GOLD) {
        game_log("Muito gold! Notificando Merchant...");
        enviarPedidoMerchant('coletarOuro');
    }
}

function getEmptySlots() {
    let emptySlots = 0;
    for (let i = 0; i < 42; i++) {
        if (!character.items[i]) {
            emptySlots++;
        }
    }
    return emptySlots;
}

// Verifica se as poções estão acabando
function verificarSuprimentos() {
    if (estado !== "farmando" || pedidoSuprimentoEnviado) return;

    let precisaDePotions = CONFIG.POTION_TYPES.some(id => quantity(id) < CONFIG.MIN_POTIONS);

    if (precisaDePotions) {
        game_log("Poucas poções! Solicitando reabastecimento...");
        enviarPedidoMerchant('reabastecer');
        pedidoSuprimentoEnviado = true;
    }
}

// Função auxiliar para enviar mensagens para o Merchant
function enviarPedidoMerchant(tipoJob) {
    send_cm(CONFIG.MERCHANT, {
        job: tipoJob,
        map: character.map,
        x: character.x,
        y: character.y,
        items: CONFIG.POTION_TYPES.map(id => ({ name: id, q: CONFIG.REFILL_QUANTITY }))
    });
    estado = "esperando_merchant";
}

// Gerencia HP, MP e Skills de utilidade
function gerenciarRecursos() {
    if (safeties && (character.hp < CONFIG.MIN_HP || character.mp < CONFIG.MIN_MP)) {
        use_hp_or_mp();
    }
    
    // Supershot para dano extra se houver mana
    if (character.mp > 400) {
        let target = get_targeted_monster();
        if (can_attack(target) && can_use("supershot")) use_skill("supershot", target);
    }
}

// Escuta as mensagens do Merchant (CM)
character.on("cm", (m) => {
    if (m.name !== CONFIG.MERCHANT) return;

    if (m.message.action === "cheguei") {
        game_log("Merchant chegou! Iniciando transferência...");
        
        // 1. Envia o Gold (deixa 5k para emergências)
        if (character.gold > 5000) {
            send_gold(CONFIG.MERCHANT, character.gold - 5000);
        }

        // 2. Envia itens de farm (tudo exceto poções)
        for (let i = 0; i < 42; i++) {
            let item = character.items[i];
            if (item && !CONFIG.POTION_TYPES.includes(item.name)) {
                send_item(CONFIG.MERCHANT, i, item.q || 1);
            }
        }

        // Aguarda 2 segundos para as transferências terminarem e libera o merchant
        setTimeout(() => {
            game_log("Transferência concluída. Voltando ao trabalho.");
            send_cm(CONFIG.MERCHANT, { job: 'finalizado' });
            estado = "farmando";
            pedidoSuprimentoEnviado = false;
        }, 2000);
    }
});



// Loop Principal (Executa tudo)
setInterval(() => {
    if (character.rip) return;
    
    loot();
    gerenciarRecursos();
    verificarOuro();
    verificarInventario();
    verificarSuprimentos();
    farmLoop();
}, 250);