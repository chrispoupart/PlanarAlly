import { computed, ref, watch } from "vue";

import { ITool, ToolFeatures, ToolMode, ToolName } from "../models/tools";

import { drawTool } from "./variants/draw";
import { filterTool } from "./variants/filter";
import { mapTool } from "./variants/map";
import { panTool } from "./variants/pan";
import { pingTool } from "./variants/ping";
import { rulerTool } from "./variants/ruler";
import { SelectFeatures, selectTool } from "./variants/select";
import { spellTool } from "./variants/spell";
import { visionTool } from "./variants/vision";

export const activeToolMode = ref(ToolMode.Play);

export const activeTool = ref(ToolName.Select);

export const toolMap: Record<string, ITool> = {
    [ToolName.Select]: selectTool,
    [ToolName.Pan]: panTool,
    [ToolName.Draw]: drawTool,
    [ToolName.Ruler]: rulerTool,
    [ToolName.Ping]: pingTool,
    [ToolName.Map]: mapTool,
    [ToolName.Filter]: filterTool,
    [ToolName.Vision]: visionTool,
    [ToolName.Spell]: spellTool,
};

const buildTools: [ToolName, ToolFeatures][] = [
    [ToolName.Select, {}],
    [ToolName.Pan, {}],
    [ToolName.Draw, {}],
    [ToolName.Ruler, {}],
    [ToolName.Map, {}],
    [ToolName.Filter, {}],
    [ToolName.Vision, {}],
];
const playTools: [ToolName, ToolFeatures][] = [
    [ToolName.Select, { disabled: [SelectFeatures.Resize, SelectFeatures.Rotate] }],
    [ToolName.Pan, {}],
    [ToolName.Spell, {}],
    [ToolName.Ruler, {}],
    [ToolName.Ping, {}],
    [ToolName.Filter, {}],
    [ToolName.Vision, {}],
];

export const dmTools = [ToolName.Map];

export const activeModeTools = computed(() => (activeToolMode.value === ToolMode.Build ? buildTools : playTools));

watch(activeTool, (newTool, oldTool) => {
    toolMap[oldTool].onDeselect();
    toolMap[newTool].onSelect();
});

export function toggleActiveMode(): void {
    activeToolMode.value = activeToolMode.value === ToolMode.Build ? ToolMode.Play : ToolMode.Build;

    if (!buildTools.some((t) => t[0] === activeTool.value) || !playTools.some((t) => t[0] === activeTool.value)) {
        activeTool.value = ToolName.Select;
    }

    const tool = toolMap[activeTool.value];
    for (const permitted of tool.permittedTools) {
        if (!(permitted.early ?? false)) continue;
        toolMap[permitted.name].onToolsModeChange(activeToolMode.value, permitted.features);
    }
    tool.onToolsModeChange(activeToolMode.value, getFeatures(activeTool.value));
    for (const permitted of tool.permittedTools) {
        if (permitted.early ?? false) continue;
        toolMap[permitted.name].onToolsModeChange(activeToolMode.value, permitted.features);
    }
}

export function getFeatures(tool: ToolName): ToolFeatures {
    return activeModeTools.value.find((t) => t[0] === tool)?.[1] ?? {};
}

export function activateTool(tool: ToolName): void {
    toolMap[tool].onSelect();
}

export function deactivateTool(tool: ToolName): void {
    toolMap[tool].onDeselect();
}
