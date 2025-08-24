const MOD = "ChatPortraits";

const State = {
    root: null,
    active: new Map()
};

Hooks.once("init", () => {
    //basic client settings
    game.settings.register(MOD, "widthPx", {
        
    });
});