const CONFIG = {
    MAX_GOLD: 500000,
    TARGET: "tortoise",
    MERCHANT: "MerchCruell",
    LEADER: "MyCruell", // Nome do seu Ranger (Líder)
    FOLLOW_DIST: 200,    // Distância máxima para se afastar do líder
    MIN_FREE_SLOTS: 20,
    MIN_POTIONS: 50,       
    REFILL_QUANTITY: 999,  
    POTION_TYPES: ["hpot0", "mpot0"], 
    MIN_HP: character.max_hp * 0.7,
    MIN_MP: character.max_mp * 0.7
};

let estado = "farmando"; // "farmando" ou "esperando_merchant"
let pedidoSuprimentoEnviado = false;

// Função principal de suporte e ataque
function farmLoop() {
    if (character.rip || estado === "esperando_merchant") return;

    let leader = get_player(CONFIG.LEADER);
    
    // 1. GESTÃO DE MOVIMENTO (Âncora no Líder)
    if (!leader) {
        if (!smart.moving) smart_move(CONFIG.LEADER);
        return;
    }

    let dist_to_leader = distance(character, leader);
    
    if (dist_to_leader > 400) {
        if (!smart.moving) smart_move(leader);
        return;
    } else if (dist_to_leader > CONFIG.FOLLOW_DIST) {
        move(
            character.x + (leader.x - character.x) * 0.5,
            character.y + (leader.y - character.y) * 0.5
        );
    }

    // 2. LÓGICA DE CURA (Prioridade Máxima)
    let party_members = Object.values(parent.entities).filter(entity => 
        entity.type === "character" && 
        entity.party === character.party && 
        distance(character, entity) < character.range
    );
    party_members.push(character); // Inclui a si mesmo

    // Encontra o membro mais ferido
    let most_hurt = party_members.sort((a, b) => (a.hp/a.max_hp) - (b.hp/b.max_hp))[0];

    if (most_hurt && most_hurt.hp / most_hurt.max_hp < 0.85) {
        if (can_use("heal")) {
            heal(most_hurt);
            return; // Prioriza cura sobre o ataque
        }
    }

    // 3. LÓGICA DE ATAQUE (Se a party estiver segura)
    let target = get_targeted_monster();
    if (!target || target.dead || target.mtype !== CONFIG.TARGET) {
        target = get_nearest_monster({ type: CONFIG.TARGET });
        if (target) change_target(target);
    }

    if (target) {
        // Se o alvo estiver longe, mas estamos perto do líder, aproxima-se
        if (distance(character, target) > character.range && dist_to_leader < 300) {
            move(
                character.x + (target.x - character.x) * 0.6,
                character.y + (target.y - character.y) * 0.6
            );
        }

        // Usa Curse em monstros com muito HP para ajudar a party
        if (can_use("curse") && target.hp > 1000) {
            use_skill("curse", target);
        }

        if (can_attack(target)) {
            attack(target);
        }
    }
}

// --- FUNÇÕES DE SUPORTE (IGUAIS AO SEU RANGER) ---

function getEmptySlots() {
    let emptySlots = 0;
    for (let i = 0; i < 42; i++) {
        if (!character.items[i]) emptySlots++;
    }
    return emptySlots;
}

function verificarInventario() {
    if (estado !== "farmando") return;
    if (getEmptySlots() <= CONFIG.MIN_FREE_SLOTS) {
        game_log("Inventário cheio! Chamando Merchant...");
        enviarPedidoMerchant('coletarItens');
    }
}

function verificarOuro() {
    if (estado === "farmando" && character.gold > CONFIG.MAX_GOLD) {
        game_log("Muito gold! Notificando Merchant...");
        enviarPedidoMerchant('coletarOuro');
    }
}

function verificarSuprimentos() {
    if (estado !== "farmando" || pedidoSuprimentoEnviado) return;
    let precisaDePotions = CONFIG.POTION_TYPES.some(id => quantity(id) < CONFIG.MIN_POTIONS);
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
        items: CONFIG.POTION_TYPES.map(id => ({ name: id, q: CONFIG.REFILL_QUANTITY }))
    });
    estado = "esperando_merchant";
}

function gerenciarRecursos() {
    if (safeties && (character.hp < CONFIG.MIN_HP || character.mp < CONFIG.MIN_MP)) {
        use_hp_or_mp();
    }
}

// --- EVENTOS ---

on_party_invite = function(name) {
    if (name === CONFIG.LEADER) accept_party_invite(name);
};

character.on("cm", (m) => {
    if (m.name !== CONFIG.MERCHANT) return;
    if (m.message.action === "cheguei") {
        game_log("Merchant chegou! Iniciando transferência...");
        if (character.gold > 5000) send_gold(CONFIG.MERCHANT, character.gold - 5000);
        for (let i = 0; i < 42; i++) {
            let item = character.items[i];
            if (item && !CONFIG.POTION_TYPES.includes(item.name)) {
                send_item(CONFIG.MERCHANT, i, item.q || 1);
            }
        }
        setTimeout(() => {
            send_cm(CONFIG.MERCHANT, { job: 'finalizado' });
            estado = "farmando";
            pedidoSuprimentoEnviado = false;
        }, 2000);
    }
});

// Loop Principal
setInterval(() => {
    if (character.rip) return;
    loot();
    gerenciarRecursos();
    verificarOuro();
    verificarInventario();
    verificarSuprimentos();
    farmLoop();
}, 250);