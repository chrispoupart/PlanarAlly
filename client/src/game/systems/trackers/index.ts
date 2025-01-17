import { reactive } from "vue";
import type { DeepReadonly } from "vue";

import { registerSystem } from "..";
import type { System } from "..";
import { SyncTo } from "../../../core/models/types";
import { getGlobalId, getShape } from "../../id";
import type { LocalId } from "../../id";
import { compositeState } from "../../layers/state";

import { partialTrackerToServer, toUiTrackers, trackersToServer } from "./conversion";
import { sendShapeCreateTracker, sendShapeRemoveTracker, sendShapeUpdateTracker } from "./emits";
import type { Tracker, TrackerId, UiTracker } from "./models";
import { createEmptyUiTracker } from "./utils";

interface TrackerState {
    id: LocalId | undefined;
    trackers: UiTracker[];
    parentId: LocalId | undefined;
    parentTrackers: UiTracker[];
}

class TrackerSystem implements System {
    private data: Map<LocalId, Tracker[]> = new Map();

    // REACTIVE STATE

    private _state: TrackerState;

    constructor() {
        this._state = reactive({
            id: undefined,
            trackers: [],
            parentId: undefined,
            parentTrackers: [],
        });
    }

    get state(): DeepReadonly<TrackerState> {
        return this._state;
    }

    loadState(id: LocalId): void {
        this._state.id = id;
        const parentId = compositeState.getCompositeParent(id)?.id;
        this._state.parentId = parentId;
        this.updateTrackerState();
    }

    dropState(): void {
        this._state.id = undefined;
    }

    updateTrackerState(): void {
        const id = this._state.id!;
        const parentId = this._state.parentId;

        const trackers = toUiTrackers(this.data.get(id) ?? [], id);
        trackers.push(createEmptyUiTracker(id));
        this._state.trackers = trackers;
        this._state.parentTrackers =
            parentId === undefined ? [] : toUiTrackers(this.data.get(parentId) ?? [], parentId);
    }

    // BEHAVIOUR

    clear(): void {
        this.dropState();
        this.data.clear();
    }

    // Inform the system about the state of a certain LocalId
    inform(id: LocalId, trackers: Tracker[]): void {
        this.data.set(id, trackers);
    }

    get(id: LocalId, trackerId: TrackerId, includeParent: boolean): DeepReadonly<Tracker> | undefined {
        return this.getAll(id, includeParent).find((t) => t.uuid === trackerId);
    }

    getAll(id: LocalId, includeParent: boolean): DeepReadonly<Tracker[]> {
        const trackers: Tracker[] = [];
        if (includeParent) {
            const parent = compositeState.getCompositeParent(id);
            if (parent !== undefined) {
                trackers.push(...this.getAll(parent.id, false));
            }
        }
        trackers.push(...(this.data.get(id) ?? []));
        return trackers;
    }

    add(id: LocalId, tracker: Tracker, syncTo: SyncTo): void {
        if (syncTo === SyncTo.SERVER) sendShapeCreateTracker(trackersToServer(getGlobalId(id), [tracker])[0]);

        this.data.get(id)!.push(tracker);

        if (id === this._state.id) this.updateTrackerState();

        if (tracker.draw) getShape(id)?.invalidate(false);
    }

    update(id: LocalId, trackerId: TrackerId, delta: Partial<Tracker>, syncTo: SyncTo): void {
        const tracker = this.data.get(id)?.find((t) => t.uuid === trackerId);
        if (tracker === undefined) return;

        if (syncTo === SyncTo.SERVER) {
            sendShapeUpdateTracker({
                ...partialTrackerToServer({
                    ...delta,
                }),
                shape: getGlobalId(id),
                uuid: trackerId,
            });
        }

        const oldDrawTracker = tracker.draw;

        Object.assign(tracker, delta);

        if (id === this._state.id) this.updateTrackerState();

        if (tracker.draw !== oldDrawTracker) getShape(id)?.invalidate(false);
    }

    remove(id: LocalId, trackerId: TrackerId, syncTo: SyncTo): void {
        if (syncTo === SyncTo.SERVER) sendShapeRemoveTracker({ shape: getGlobalId(id), value: trackerId });

        const oldTracker = this.get(id, trackerId, false);

        this.data.set(id, this.data.get(id)?.filter((tr) => tr.uuid !== trackerId) ?? []);

        if (id === this._state.id) this.updateTrackerState();

        if (oldTracker?.draw === true) getShape(id)?.invalidate(false);
    }
}

export const trackerSystem = new TrackerSystem();
registerSystem("trackers", trackerSystem);
