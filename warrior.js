const CONFIG = {
    MAX_GOLD: 40000,
    TARGET: "tortoise",
    MERCHANT: "MerchCruell",
    LEADER: "MyCruell", // Nome do seu Ranger (Líder)
    FOLLOW_DIST: 35,    // Warrior fica mais perto do líder que o Priest
    MIN_FREE_SLOTS: 3,
    MIN_POTIONS: 50,       
    REFILL_QUANTITY: 500,  
    POTION_TYPES: ["hpot0", "mpot0"],
    MIN_HP: character.max_hp * 0.7,
    MIN_MP: character.max_mp * 0.4
};

let estado = "farmando";
let pedidoSuprimentoEnviado = false;

function warriorLoop() {
    if (character.rip || estado === "esperando_merchant") return;

    let leader = get_player(CONFIG.LEADER);

    // 1. Verificação de Âncora (Não deixa o Ranger sozinho)
    if (leader) {
        if (distance(character, leader) > 250) {
            move(
                character.x + (leader.x - character.x) * 0.5,
                character.y + (leader.y - character.y) * 0.5
            );
        }
    } else {
        smart_move(CONFIG.LEADER);
        return;
    }

    // 2. Combate Independente e Taunt
    let target = get_targeted_monster();
    
    // Procura o monstro MAIS PRÓXIMO dele mesmo, não do líder
    if (!target || target.dead || target.mtype !== CONFIG.TARGET) {
        target = get_nearest_monster({ type: CONFIG.TARGET });
        if (target) change_target(target);
    }

    if (target) {
        // Move-se para o seu próprio alvo
        if (distance(character, target) > character.range) {
            move(
                character.x + (target.x - character.x) * 0.7,
                character.y + (target.y - character.y) * 0.7
            );
        }

        // Taunt para proteger quem estiver perto desse alvo
        if (can_use("taunt") && distance(character, target) < 200) {
            use_skill("taunt", target);
        }

        if (can_attack(target)) attack(target);
    }
}

// --- FUNÇÕES DE SUPORTE (IGUAL AO PRIEST/RANGER) ---

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
        game_log("Gold alto! Chamando Merchant...");
        enviarPedidoMerchant('coletarOuro');
    }
}

function verificarSuprimentos() {
    if (estado !== "farmando" || pedidoSuprimentoEnviado) return;
    let precisaDePotions = CONFIG.POTION_TYPES.some(id => quantity(id) < CONFIG.MIN_POTIONS);
    if (precisaDePotions) {
        game_log("Solicitando poções...");
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
    if (name === CONFIG.LEADER) {
        accept_party_invite(name);
    }
};

character.on("cm", (m) => {
    if (m.name !== CONFIG.MERCHANT) return;
    if (m.message.action === "cheguei") {
        game_log("Merchant aqui! Transferindo...");
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

setInterval(() => {
    if (character.rip) return;
    loot();
    gerenciarRecursos();
    verificarOuro();
    verificarInventario();
    verificarSuprimentos();
    warriorLoop();
}, 250);