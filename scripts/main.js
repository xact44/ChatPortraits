const MOD = "ChatPortraits";

const State = {
    root: null,
    active: new Map()
};

Hooks.once("init", () => {
    //basic client settings
    //width
    game.settings.register(MOD, "widthPx", {
        name: "Portrait Width (px)", scope: "client", config: true, type: Number, default: 320
    });
    //duration the portrait is out
    game.settings.register(MOD, "durationMs", {
        name: "Auto-Hide Duration (ms)", scope: "client", config: true, type: Number, default: 4000
    });
    //which side the portrait comes out, client side
    game.settings.register(MOD, "sideMode", {
        name: "Side Mode", scope: "client", config: true, type: String,
        choices: {auto: "Auto (GM->left, Player->right)", left: "Left", right: "Right" },
        default: "auto"
    });
    //Y position of left side
    game.settings.register(MOD, "baselineLeft", {
        name: "Left Lane Baseline Y", scope: "client", config: true, type: Number, default: 120
    });
    //Y position of right side
    game.settings.register(MOD, "baselineRight", {
        name: "Right Lane Baseline Y", scope: "client", config: true, type: Number, default: 120
    });
    //any custom offsets
    game.settings.register(MOD, "customOffsets", {
        name: "Custom Offsets", scope: "client", config: false, type: Object, default: {}
    });

    //give ten portrait slots, maybe descrease this
    for(let i = 0; i < 10; i++){
        game.settings.register(MOD, `slot.${i}.image`, {
            name: `Slot ${i} Image`, scope: "client", config: true, type: String, default: "", filePicker: true
        });
    }

    //hotkeys!
    for(let i = 0; i < 10; i++) {
        game.keybindings.register(MOD, `slot-${i}`, {
            name: `Trigger Portrait Slot ${i}`,
            editable: [{key: `Numpad${i}`, modifiers: ["SHIFT"]}],
            onDown: () => triggerPortrait(i)
        });
    }
});

Hooks.once("ready", () => {
    ensureRoot();
    game.socket.on(`module.${MOD}`, payload => renderPortrait(payload));
    Hooks.on("canvasReady", ensureRoot);
});

function ensureRoot() {
    if(State.root?.isConnected) return;
    const board = document.querySelector("#board");
    if(!board) return;
    const root = document.createElement("div");
    root.id = `${MOD}-root`;
    root.className = "pcanvas-root";
    board.appendChild(root);
    State.root = root;
}

async function triggerPortrait(slot) {
    const image = game.settings.get(MOD, `slot.${slot}.image`);
    if(!image) {ui.notifications.warn(`No image set for slow ${slot}.`); return; }

    const sideMode = game.settings.get(MOD, "sideMode");
    const side = sideMode === "auto"? (game.user.isGM ? "left" : "right") : sideMode;

    const payload = {
        id: `${game.user.id}-${Date.now()}-${slot}`,
        userId: game.user.id,
        userName: game.user.name,
        image,
        side,
        widthPx: game.settings.get(MOD, "widthPx"),
        duration: game.settings.get(MOD, "durationms")
    };

    game.socket.emit(`module.${MOD}`, payload);
    renderPortrait(payload);
}

function renderPortrait({id, userName, image, side, widthPx, duration}) {
    ensureRoot(); if (!State.root) return;

    const lane = side === "left" ? "left" : "right";
    const y = computeY(lane, widthPx);

    const el = document.createElement("div");
    el.className = `pcanvas-item ${lane}`;
    el.dataset.portraitId = id;
    el.style.width = `${widthPx}px`;
    el.style.top = `${y}px`;
    el.innerHTML = `
        <div class="pcanvas-frame">
            <img class="pcanvas-img" src="${escapeHtml(image)}" alt="${escapeHtml(userName)}">
            <div class="pcanvas-name">${escapeHtml(userName)}</div>
        </div>
    `;
    attachDrag(el);

    //start offset for slde in feel. Consider adjusting to use actual animation via css
    el.style.transform = lane === "left" ? "translateX(-16px)" : "translateX(16px)";
    State.root.appendChild(el);
    void el.offsetWidth; //reflow
    el.classList.add("in");
    el.style.opacity = "1";
    el.style.transform = "translateX(0)";

    const timeoutId = setTimeout(() => dismiss(id), Math.max(600, Number(duration) || 4000));
    State.active.set(id, {e, timeoutId});
}

function computeY(lane, widthPx) {
    const baseline = game.settings.get(MOD, lane === "left" ? "baselineLeft" : "baselineRight");
    const itemHeight = Math.round(widthPx * 1.2);
    const spacing = 12;

    const inLane = [...State.active.values()]
        .map(x => x.el)
        .filter(el => el.classList.contains(lane))
        .map(el => ({ top: parseInt(el.style.top || "0", 10), height: el.getBoundingClientRect().height || itemHeight }))
        .sort((a, b) => a.top - b.top)
    ;

    let y = baseline;
    for(const o of inLane) {
        const need = y + itemHeight + spacing;
        if(need <= o.top) break;
        y = Math.max(y, o.top + o.height + spacing);
    }
    return y;
}

function dismiss(id) {
    const entry = State.active.get(id);
    if(!entry) return;
    clearTimeout(entry.timeoutId);
    const el = entry.el;
    el.style.opacity = "0";
    el.style.transform += " translateY(-6px)";
    el.addEventListener("transitionend", () => {
        el.remove();
        State.active.delete(id);
    }, {once: true});
}

function attachDrag(el) {
    let dragging = false, startX=0, startY=0, baseTop=0, baseInset=0, isLeft = el.classList.contains("left");

    el.addEventListener("pointerdown", (ev) => {
        if(!ev.altKey) return; //Alt+Drag
        dragging = true; 
        el.setPointerCapture(ev.pointerId);
        startX = ev.clientX; startY = ev.clientY;
        baseTop = parseInt(el.style.top || "0", 10);
        baseInset = parseInt(el.style[isLeft ? "left" : "right"] || "24", 10);
        ev.preventDefault(); ev.stopPropagation();
    });
    el.addEventListener("pointermove", (ev) => {
        if(!dragging) return;
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        el.style.top = `${baseTop + dy}px`;
        if(isLeft) el.style.left = `${Math.max(0, baseInset + dx)}px`;
        else el.styl.right =`${Math.max(0, baseInset - dx)}px`;
    });
    el.addeventListener("pointerup", (ev) => {
        if(!dragging) return;
        dragging = false;
        el.releasePointerCapture(ev.pointerId);
    });
}

function escapeHtml(s) {
    return s?.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])) ?? "";
}