const merchantConfig = {
    venda: { map: 'main', x: -6, y: 70 },
    npc_potions: { map: 'main', x: 56, y: -122 },
    npc_scrolls: { map: 'main', x: -464, y: -65 }, // Localização do Lucas
    meusPersonagens: ['MyCruell', 'RockStar', 'CruellWR'], // Substitua pelos seus nomes
    minGoldToKeep: 50000,
    maxUpgradeLevel: 8,
    itemsUpgrade: [],
    lixosVenda: [
        "ringsj", "hpamulet", "stramulet", "hpbelt", "vitring",
        "whitegloves", "phelmet", "skullamulet", "dexamulet", "dexring", "intamulet", "intring", "vitearring", "dexearring",
        "wshoes",
    ],
};

let jobAtual = '';
let status = {
    vendendo: false,
    solicitante: null,
    destino: null,
    itensPedidos: []
};

async function loopPrincipal() {
    try {
        if (character.rip) return;

        if (character.gold > merchantConfig.minGoldToKeep) {
			jobAtual = 'depositoBanco';
			
            await smart_move('bank');
            await parent.socket.emit("bank", {
                operation: "deposit",
                amount: character.gold - merchantConfig.minGoldToKeep
            });
			
			jobAtual = 'venda';
        }

        // 1. PRIORIDADE: Se o Ranger pediu poções e eu não as tenho, vou comprar primeiro
        if (jobAtual === 'reabastecer' && !temItensNecessarios()) {
            fecharLojaSeAberta();
            await irComprarSuprimentos();
            return;
        }

        // 2. MANUTENÇÃO: Se estiver livre na vila, faz upgrades para economizar espaço
        if (jobAtual === 'venda' && !character.moving) {
            await processarItens();
        }

        // 3. MOVIMENTAÇÃO: Define para onde o Merchant deve ir
        const task = jobAtual === 'venda' ? merchantConfig.venda : status.destino;

        if (task) {
            const dist = distance(character, task);
            if (dist > 25) {
                if (!character.moving) {
                    fecharLojaSeAberta();
                    await smart_move({ map: task.map, x: task.x, y: task.y });
                }
            } else {
                executarAcaoLocal();
            }
        }
    } catch (e) {
        console.error("Erro no Merchant Loop:", e);
    }
    setTimeout(loopPrincipal, 1000);
}

// --- LÓGICA DE UPGRADE ---
async function processarItens() {
    for (let i = 0; i < character.isize; i++) {
        let item = character.items[i];
        if (!item) continue;

        // 1. Lógica de Venda de Lixo (Vende se estiver no NPC)
        if (merchantConfig.lixosVenda.includes(item.name)) {
            game_log("Vendendo lixo: " + item.name);
            sell(i, item.q || 1);
            continue; // Pula para o próximo item
        }

        // 2. Lógica de Upgrade (Apenas se estiver na lista de upgrade)
        if (merchantConfig.itemsUpgrade.includes(item.name) && item.level < merchantConfig.maxUpgradeLevel) {

            let grade = item_grade(item);
            let scroll_name = "scroll" + grade;
            let scroll_slot = locate_item(scroll_name);

            if (scroll_slot === -1) {
                fecharLojaSeAberta();
                if (distance(character, merchantConfig.npc_scrolls) > 30) {
                    await smart_move(merchantConfig.npc_scrolls);
                }
                buy(scroll_name, 10);
                return; // Para o loop para esperar a compra
            }

            if (!character.q.upgrade) {
                fecharLojaSeAberta();
                game_log(`Upando ${item.name} para +${item.level + 1}`);
                await upgrade(i, scroll_slot);
                return; // Espera o próximo ciclo
            }
        }
    }
}

// --- LÓGICA DE COMPRA DE POÇÕES ---
async function irComprarSuprimentos() {
    const npc = merchantConfig.npc_potions;
    if (distance(character, npc) > 30) {
        await smart_move(npc);
    } else {
        for (let item of status.itensPedidos) {
            let qtdNecessaria = item.q - quantity(item.name);
            if (qtdNecessaria > 0) {
                buy(item.name, qtdNecessaria);
                game_log(`Comprei ${qtdNecessaria}x ${item.name}`);
            }
        }
    }
}

// --- AÇÕES AO CHEGAR NO DESTINO ---
function executarAcaoLocal() {
    // Se o job for venda, abre a loja
    if (jobAtual === 'venda' && !status.vendendo) {
        parent.open_merchant(41);
        status.vendendo = true;
        game_log("Loja aberta para negócios.");
    }

    // Se estiver perto do Ranger (solicitante)
    if (status.solicitante) {
        let alvo = get_player(status.solicitante);
        if (alvo && distance(character, alvo) < 400) {

            // Se for reabastecimento, envia as poções
            if (jobAtual === 'reabastecer') {
                status.itensPedidos.forEach(item => {
                    let slot = locate_item(item.name);
                    if (slot !== -1) send_item(status.solicitante, slot, item.q);
                });
            }

            // Avisa o Ranger que está pronto para receber/entregar
            send_cm(status.solicitante, { action: "cheguei" });
        }
    }
}

// --- FUNÇÕES AUXILIARES ---
function fecharLojaSeAberta() {
    if (status.vendendo) {
        parent.close_merchant();
        status.vendendo = false;
    }
}

function temItensNecessarios() {
    if (status.itensPedidos.length === 0) return true;
    return status.itensPedidos.every(item => quantity(item.name) >= item.q);
}

// --- COMUNICAÇÃO ---
character.on("cm", (m) => {
    if (!merchantConfig.meusPersonagens.includes(m.name)) return;

    let data = typeof m.message === "string" ? JSON.parse(m.message) : m.message;

    // Recebe chamados: coletarOuro, reabastecer ou coletarItens
    if (['coletarOuro', 'reabastecer', 'coletarItens'].includes(data.job)) {
        jobAtual = data.job;
        status.solicitante = m.name;
        status.destino = { map: data.map, x: data.x, y: data.y };
        status.itensPedidos = data.items || [];
        fecharLojaSeAberta();
        game_log(`Novo trabalho: ${jobAtual} para ${m.name}`);
    }

    // Quando o Ranger termina a transferência
    if (data.job === 'finalizado') {
        jobAtual = 'venda';
        status.solicitante = null;
        status.destino = null;
        status.itensPedidos = [];
        game_log("Trabalho concluído. A voltar para a vila.");
    }
});

loopPrincipal();