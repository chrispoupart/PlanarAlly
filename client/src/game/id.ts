import { uuidv4 } from "../core/utils";

import type { IShape } from "./shapes/interfaces";

export type Global<T> = {
    [key in keyof T]: T[key] extends LocalId ? GlobalId : T[key] extends LocalId[] ? GlobalId[] : T[key];
};
export type GlobalId = string & { __brand: "globalId" };
export type LocalId = number & { __brand: "localId" };

// Array of GlobalId indexed by localId
const uuids: GlobalId[] = [];

const idMap: Map<LocalId, IShape> = new Map();
(window as any).idMap = idMap;

let lastId = -1;
const freeIds: LocalId[] = [];
const reservedIds: Map<GlobalId, LocalId> = new Map();

function generateId(): LocalId {
    return freeIds.pop() ?? (++lastId as LocalId);
}

// Prepare a LocalId for a GlobalId
// This is used when a shape is not fully created yet, but already requires some LocalId knowledge
export function reserveLocalId(uuid: GlobalId): LocalId {
    const local = generateId();
    uuids[local] = uuid;
    reservedIds.set(uuid, local);
    return local;
}

export function generateLocalId(shape: IShape, global?: GlobalId): LocalId {
    let local: LocalId;
    if (global && reservedIds.has(global)) {
        local = reservedIds.get(global)!;
        reservedIds.delete(global);
    } else {
        local = generateId();
        uuids[local] = global ?? uuidv4();
    }
    idMap.set(local, shape);
    return local;
}

export function dropId(id: LocalId): void {
    reservedIds.delete(uuids[id]);
    delete uuids[id];
    idMap.delete(id);
    freeIds.push(id);
}

export function getGlobalId(local: LocalId): GlobalId {
    return uuids[local];
}

export function getLocalId(global: GlobalId): LocalId | undefined {
    for (const [i, value] of uuids.entries()) {
        if (value === global) return i as LocalId;
    }
}

export function getShape(local: LocalId): IShape | undefined {
    return idMap.get(local);
}

export function getShapeFromGlobal(global: GlobalId): IShape | undefined {
    const local = getLocalId(global);
    return local === undefined ? undefined : getShape(local);
}

export function getAllShapes(): IterableIterator<IShape> {
    return idMap.values();
}
